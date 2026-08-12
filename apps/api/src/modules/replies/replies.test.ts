import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import {
  capsuleRecipients,
  capsuleReplies,
  capsules,
  notifications,
  outboundMessages,
  users,
} from '../../db/schema/index.js';
import { generateAccessToken, hashAccessToken } from '../recipients/index.js';

const app = createApp(db);
const trackedUserIds: string[] = [];
const trackedCapsuleIds: string[] = [];

/**
 * Stands in for a real client's ciphertext. The server must treat this as
 * opaque — every assertion below depends on it never being interpreted.
 */
const CIPHERTEXT = Buffer.from('iv-and-ciphertext-bytes').toString('base64');

async function createOwner() {
  const [owner] = await db
    .insert(users)
    .values({ email: `replies-owner-${randomUUID()}@example.com`, displayName: 'Replies Owner', status: 'active' })
    .returning();
  trackedUserIds.push(owner!.id);
  return owner!;
}

async function createCapsule(overrides: Partial<typeof capsules.$inferInsert> = {}) {
  const owner = await createOwner();
  const [capsule] = await db
    .insert(capsules)
    .values({
      ownerId: owner.id,
      type: 'personal',
      publicId: randomUUID().slice(0, 8).toUpperCase(),
      state: 'unlocked',
      unlockAt: new Date(Date.now() - 60_000),
      contentDocEnc: Buffer.from('fake-ciphertext'),
      ...overrides,
    })
    .returning();
  trackedCapsuleIds.push(capsule!.id);

  const rawToken = generateAccessToken();
  const [recipient] = await db
    .insert(capsuleRecipients)
    .values({
      capsuleId: capsule!.id,
      email: `replies-recipient-${randomUUID()}@example.com`,
      displayName: 'Replies Recipient',
      accessTokenHash: hashAccessToken(rawToken),
      status: 'opened',
    })
    .returning();

  return { owner, capsule: capsule!, recipient: recipient!, rawToken };
}

describe('replies (M3)', () => {
  afterAll(async () => {
    for (const id of trackedCapsuleIds) await db.delete(capsules).where(eq(capsules.id, id));
    for (const id of trackedUserIds) await db.delete(users).where(eq(users.id, id));
    await pool.end();
  });

  it('stores only ciphertext — no column holds anything the server could read', async () => {
    const { capsule, rawToken } = await createCapsule();

    const res = await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: CIPHERTEXT });
    expect(res.status).toBe(201);

    const [row] = await db.select().from(capsuleReplies).where(eq(capsuleReplies.capsuleId, capsule.id));
    expect(row?.bodyEnc).toBe(CIPHERTEXT);
    expect(row?.author).toBe('recipient');

    // The whole row, stringified, must not contain a plaintext field. This is
    // the guarantee the predecessor broke: `reactions.note` was plain text.
    expect(Object.keys(row!)).toEqual(
      expect.arrayContaining(['id', 'capsuleId', 'recipientId', 'author', 'bodyEnc', 'createdAt']),
    );
    expect(Object.keys(row!)).not.toContain('note');
    expect(Object.keys(row!)).not.toContain('emoji');
  });

  it('notifies the sender that a reply exists without carrying any part of it', async () => {
    const { owner, capsule, rawToken } = await createCapsule();
    await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: CIPHERTEXT });

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    const social = notifs.find((n) => n.category === 'social');
    expect(social).toBeTruthy();
    expect(social!.title).toContain('replied');
    // The body is where the reply text used to be put verbatim.
    expect(social!.body).toBeNull();
    expect(JSON.stringify(social)).not.toContain(CIPHERTEXT);

    const mail = await db.select().from(outboundMessages).where(eq(outboundMessages.template, 'reply-received'));
    const mine = mail.filter((m) => m.toRef === owner.email);
    expect(mine.length).toBeGreaterThan(0);
    // The persisted email payload must not carry the reply either — sending
    // the template also writes its props to the ledger.
    expect(JSON.stringify(mine)).not.toContain(CIPHERTEXT);
    void capsule;
  });

  it('refuses a reply before the capsule has opened', async () => {
    const { rawToken } = await createCapsule({ state: 'sealed', unlockAt: new Date(Date.now() + 60_000) });
    const res = await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: CIPHERTEXT });
    expect(res.status).toBe(403);
  });

  it('keeps the conversation in the order it was written, both authors together', async () => {
    const { capsule, recipient, rawToken } = await createCapsule();

    await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: Buffer.from('first').toString('base64') });
    await db.insert(capsuleReplies).values({
      capsuleId: capsule.id,
      recipientId: recipient.id,
      author: 'sender',
      bodyEnc: Buffer.from('second').toString('base64'),
    });
    await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: Buffer.from('third').toString('base64') });

    const res = await request(app).get(`/v1/r/${rawToken}/replies`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { author: string }) => r.author)).toEqual(['recipient', 'sender', 'recipient']);
    expect(res.body.data.map((r: { bodyEnc: string }) => Buffer.from(r.bodyEnc, 'base64').toString())).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('shows a recipient their own thread and never another recipient’s', async () => {
    const { capsule, rawToken } = await createCapsule();

    // A second person on the same capsule — a separate correspondence.
    const otherToken = generateAccessToken();
    const [other] = await db
      .insert(capsuleRecipients)
      .values({
        capsuleId: capsule.id,
        email: `replies-other-${randomUUID()}@example.com`,
        accessTokenHash: hashAccessToken(otherToken),
        status: 'opened',
      })
      .returning();

    await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: Buffer.from('mine').toString('base64') });
    await request(app).post(`/v1/r/${otherToken}/replies`).send({ bodyEnc: Buffer.from('theirs').toString('base64') });

    const mine = await request(app).get(`/v1/r/${rawToken}/replies`);
    expect(mine.body.data).toHaveLength(1);
    expect(Buffer.from(mine.body.data[0].bodyEnc, 'base64').toString()).toBe('mine');
    void other;
  });

  it('does not swallow a reply to a guest-sealed capsule that has no account to notify', async () => {
    const [capsule] = await db
      .insert(capsules)
      .values({
        ownerId: null,
        type: 'personal',
        publicId: randomUUID().slice(0, 8).toUpperCase(),
        state: 'unlocked',
        unlockAt: new Date(Date.now() - 60_000),
        contentDocEnc: Buffer.from('fake-ciphertext'),
      })
      .returning();
    trackedCapsuleIds.push(capsule!.id);

    const rawToken = generateAccessToken();
    await db.insert(capsuleRecipients).values({
      capsuleId: capsule!.id,
      email: `replies-guest-${randomUUID()}@example.com`,
      accessTokenHash: hashAccessToken(rawToken),
      status: 'opened',
    });

    const res = await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: CIPHERTEXT });
    expect(res.status).toBe(201);

    const rows = await db.select().from(capsuleReplies).where(eq(capsuleReplies.capsuleId, capsule!.id));
    expect(rows).toHaveLength(1);
  });

  it('refuses to show one account the replies on another account’s capsule', async () => {
    const { capsule, rawToken } = await createCapsule();
    await request(app).post(`/v1/r/${rawToken}/replies`).send({ bodyEnc: CIPHERTEXT });

    const signup = await request(app)
      .post('/v1/auth/signup')
      .send({
        email: `replies-stranger-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Stranger',
        masterKeyWrap: 'dGVzdA==',
        recoveryKeyWrap: 'dGVzdA==',
      });
    trackedUserIds.push(signup.body.user.id);

    const res = await request(app)
      .get(`/v1/capsules/${capsule.id}/replies`)
      .set('Authorization', `Bearer ${signup.body.tokens.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('requires authentication to read the sender’s side', async () => {
    const { capsule } = await createCapsule();
    const res = await request(app).get(`/v1/capsules/${capsule.id}/replies`);
    expect(res.status).toBe(401);
  });
});
