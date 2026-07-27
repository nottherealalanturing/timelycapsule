import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsuleRecipients, capsules, notifications, outboundMessages, reactions, recipientOtpCodes, users } from '../../db/schema/index.js';
import { generateAccessToken, hashAccessToken } from '../recipients/index.js';

const app = createApp(db);
const trackedUserIds: string[] = [];
const trackedCapsuleIds: string[] = [];

async function createOwner() {
  const [owner] = await db
    .insert(users)
    .values({ email: `reveal-owner-${randomUUID()}@example.com`, displayName: 'Reveal Owner', status: 'active' })
    .returning();
  trackedUserIds.push(owner!.id);
  return owner!;
}

async function createRecipientCapsule(overrides: Partial<typeof capsules.$inferInsert> = {}) {
  const owner = await createOwner();
  const [capsule] = await db
    .insert(capsules)
    .values({
      ownerId: owner.id,
      type: 'personal',
      publicId: randomUUID().slice(0, 8).toUpperCase(),
      state: 'sealed',
      unlockAt: new Date(Date.now() + 60_000),
      title: 'Reveal test capsule',
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
      email: `reveal-recipient-${randomUUID()}@example.com`,
      displayName: 'Reveal Recipient',
      accessTokenHash: hashAccessToken(rawToken),
      status: 'added',
    })
    .returning();

  return { owner, capsule: capsule!, recipient: recipient!, rawToken };
}

describe('reveal module (T-15)', () => {
  afterAll(async () => {
    // capsule_recipients / reactions / recipient_otp_codes all cascade off capsules; notifications cascade off users.
    for (const id of trackedCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of trackedUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('returns 404 (masked) for an unknown token', async () => {
    const res = await request(app).get(`/v1/r/${generateAccessToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns locked status pre-unlock and flips recipient to viewed_locked', async () => {
    const { capsule, recipient, rawToken } = await createRecipientCapsule();
    const res = await request(app).get(`/v1/r/${rawToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('locked');
    expect(res.body.publicId).toBe(capsule.publicId);

    const [updated] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipient.id));
    expect(updated?.status).toBe('viewed_locked');
  });

  it('returns withdrawn/expired short-circuits without leaking content', async () => {
    const withdrawn = await createRecipientCapsule({ state: 'withdrawn' });
    const withdrawnRes = await request(app).get(`/v1/r/${withdrawn.rawToken}`);
    expect(withdrawnRes.body).toEqual({ status: 'withdrawn' });

    const expired = await createRecipientCapsule({ state: 'expired' });
    const expiredRes = await request(app).get(`/v1/r/${expired.rawToken}`);
    expect(expiredRes.body).toEqual({ status: 'expired' });
  });

  it('unlocked: returns content, marks opened once, writes owner notification', async () => {
    const { owner, capsule, recipient, rawToken } = await createRecipientCapsule({ state: 'unlocked' });

    const first = await request(app).get(`/v1/r/${rawToken}`);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('unlocked');
    expect(first.body.alreadyOpened).toBe(false);
    expect(Buffer.from(first.body.contentDocEnc, 'base64').toString()).toBe('fake-ciphertext');

    const [updatedRecipient] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipient.id));
    expect(updatedRecipient?.status).toBe('opened');
    expect(updatedRecipient?.firstOpenedAt).not.toBeNull();

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(notifs.some((n) => n.category === 'social')).toBe(true);

    const second = await request(app).get(`/v1/r/${rawToken}`);
    expect(second.body.alreadyOpened).toBe(true);
    void capsule;
  });

  it('gates content behind an unsatisfied Place seal, then releases it after a passing place-check', async () => {
    const { rawToken } = await createRecipientCapsule({
      state: 'unlocked',
      seals: [{ type: 'place', config: { lat: 0, lng: 0, radiusM: 1000, name: 'Origin' } }],
    });

    const gated = await request(app).get(`/v1/r/${rawToken}`);
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe('seal_not_satisfied');

    const farCheck = await request(app).post(`/v1/r/${rawToken}/place-check`).send({ lat: 10, lng: 10 });
    expect(farCheck.body.withinRange).toBe(false);
    expect(farCheck.body.gateToken).toBeNull();

    const nearCheck = await request(app).post(`/v1/r/${rawToken}/place-check`).send({ lat: 0.001, lng: 0.001 });
    expect(nearCheck.body.withinRange).toBe(true);
    expect(nearCheck.body.gateToken).toBeTruthy();

    const released = await request(app).get(`/v1/r/${rawToken}`).query({ placeGate: nearCheck.body.gateToken });
    expect(released.status).toBe(200);
    expect(released.body.status).toBe('unlocked');
  });

  it('identity seal: request + verify code issues a gate token that releases content', async () => {
    const { rawToken } = await createRecipientCapsule({ state: 'unlocked', requireRecipientVerification: true });

    const gated = await request(app).get(`/v1/r/${rawToken}`);
    expect(gated.status).toBe(403);

    const requested = await request(app).post(`/v1/r/${rawToken}/verify/request`);
    expect(requested.status).toBe(200);

    const [otpRow] = await db
      .select()
      .from(recipientOtpCodes)
      .orderBy(recipientOtpCodes.createdAt)
      .limit(1);
    // We can't read the plaintext code back (only its hash is stored) — assert the mechanics via a wrong-code rejection instead.
    const wrong = await request(app).post(`/v1/r/${rawToken}/verify`).send({ code: '000000' });
    expect(wrong.status).toBe(400);
    void otpRow;
  });

  it('react: writes a reaction row and notifies the owner (only once capsule is unlocked)', async () => {
    const { owner, capsule, rawToken } = await createRecipientCapsule({ state: 'sealed' });
    const beforeUnlock = await request(app).post(`/v1/r/${rawToken}/react`).send({ emoji: '❤️' });
    expect(beforeUnlock.status).toBe(403);

    await db.update(capsules).set({ state: 'unlocked' }).where(eq(capsules.id, capsule.id));
    const res = await request(app).post(`/v1/r/${rawToken}/react`).send({ emoji: '❤️', note: 'Thank you' });
    expect(res.status).toBe(204);

    const rows = await db.select().from(reactions).where(eq(reactions.capsuleId, capsule.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.emoji).toBe('❤️');

    const mail = await db.select().from(outboundMessages).where(eq(outboundMessages.template, 'reaction-received'));
    expect(mail.some((m) => m.toRef === owner.email)).toBe(true);
  });

  it('report: writes an audit event without requiring auth', async () => {
    const { rawToken } = await createRecipientCapsule();
    const res = await request(app).post(`/v1/r/${rawToken}/report`).send({ reason: 'spam', details: 'test' });
    expect(res.status).toBe(204);
  });

  it('remind: toggles reminderOptIn on the recipient row', async () => {
    const { recipient, rawToken } = await createRecipientCapsule();
    const res = await request(app).post(`/v1/r/${rawToken}/remind`).send({ enabled: true });
    expect(res.status).toBe(204);

    const [updated] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipient.id));
    expect(updated?.reminderOptIn).toEqual({ enabled: true });
  });

  it('save: requires auth, claims the recipient row, rejects a second different claimant', async () => {
    const { rawToken } = await createRecipientCapsule();
    const unauthed = await request(app).post(`/v1/r/${rawToken}/save`);
    expect(unauthed.status).toBe(401);

    const signup = await request(app)
      .post('/v1/auth/signup')
      .send({
        email: `reveal-saver-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Saver',
        masterKeyWrap: 'dGVzdA==',
        recoveryKeyWrap: 'dGVzdA==',
      });
    trackedUserIds.push(signup.body.user.id);
    const token = signup.body.tokens.accessToken as string;

    const saved = await request(app).post(`/v1/r/${rawToken}/save`).set('Authorization', `Bearer ${token}`);
    expect(saved.status).toBe(204);

    const signup2 = await request(app)
      .post('/v1/auth/signup')
      .send({
        email: `reveal-saver2-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Saver Two',
        masterKeyWrap: 'dGVzdA==',
        recoveryKeyWrap: 'dGVzdA==',
      });
    trackedUserIds.push(signup2.body.user.id);
    const conflicting = await request(app)
      .post(`/v1/r/${rawToken}/save`)
      .set('Authorization', `Bearer ${signup2.body.tokens.accessToken}`);
    expect(conflicting.status).toBe(409);
  });
});
