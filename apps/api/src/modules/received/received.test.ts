import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { auditEvents, capsuleRecipients, capsules, entitlements, users } from '../../db/schema/index.js';

const app = createApp(db);
const createdUserIds: string[] = [];
const createdCapsuleIds: string[] = [];

function uniqueEmail(prefix = 'received-test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

async function createSignedUpUser() {
  const email = uniqueEmail();
  const signupRes = await request(app)
    .post('/v1/auth/signup')
    .send({
      email,
      password: 'correct-horse-battery-staple',
      displayName: 'Test Recipient',
      masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
      recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
    });
  expect(signupRes.status).toBe(201);
  const userId = signupRes.body.user.id as string;
  createdUserIds.push(userId);
  return { userId, email, accessToken: signupRes.body.tokens.accessToken as string };
}

async function createOwner() {
  const [owner] = await db
    .insert(users)
    .values({ email: uniqueEmail('owner'), displayName: 'Capsule Sender', status: 'active' })
    .returning();
  createdUserIds.push(owner!.id);
  return owner!;
}

async function createCapsuleForRecipient(
  ownerId: string,
  recipientUserId: string,
  capsuleOverrides: Partial<typeof capsules.$inferInsert>,
  recipientOverrides: Partial<typeof capsuleRecipients.$inferInsert> = {},
) {
  const [capsule] = await db
    .insert(capsules)
    .values({
      ownerId,
      type: 'personal',
      publicId: randomUUID().slice(0, 8).toUpperCase(),
      title: 'A capsule for you',
      state: 'sealed',
      ...capsuleOverrides,
    })
    .returning();
  createdCapsuleIds.push(capsule!.id);

  const [recipient] = await db
    .insert(capsuleRecipients)
    .values({
      capsuleId: capsule!.id,
      userId: recipientUserId,
      accessTokenHash: randomUUID(),
      status: 'notified',
      ...recipientOverrides,
    })
    .returning();

  return { capsule: capsule!, recipient: recipient! };
}

function authed(token: string) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  };
}

describe('received module (T-16)', () => {
  afterAll(async () => {
    for (const id of createdCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('categorizes upcoming, waiting, and opened capsules', async () => {
    const recipientUser = await createSignedUpUser();
    const owner = await createOwner();

    const { capsule: upcoming } = await createCapsuleForRecipient(owner.id, recipientUser.userId, {
      state: 'sealed',
      unlockAt: new Date(Date.now() + 86_400_000),
    });
    const { capsule: waiting } = await createCapsuleForRecipient(owner.id, recipientUser.userId, {
      state: 'unlocked',
      unlockAt: new Date(Date.now() - 1000),
    });
    const { capsule: opened } = await createCapsuleForRecipient(
      owner.id,
      recipientUser.userId,
      { state: 'unlocked', unlockAt: new Date(Date.now() - 2000) },
      { status: 'opened', firstOpenedAt: new Date() },
    );
    // A not-yet-announced recipient row should never surface.
    await createCapsuleForRecipient(owner.id, recipientUser.userId, { state: 'draft' }, { status: 'added' });

    const res = await authed(recipientUser.accessToken).get('/v1/received');
    expect(res.status).toBe(200);
    const bySection = Object.fromEntries(res.body.data.map((r: { capsuleId: string; section: string }) => [r.capsuleId, r.section]));
    expect(bySection[upcoming.id]).toBe('upcoming');
    expect(bySection[waiting.id]).toBe('waiting');
    expect(bySection[opened.id]).toBe('opened');
    expect(res.body.data).toHaveLength(3);

    const openedItem = res.body.data.find((r: { capsuleId: string }) => r.capsuleId === opened.id);
    expect(openedItem.senderName).toBe('Capsule Sender');
  });

  it('excludes blocked_suppressed rows', async () => {
    const recipientUser = await createSignedUpUser();
    const owner = await createOwner();
    await createCapsuleForRecipient(
      owner.id,
      recipientUser.userId,
      { state: 'sealed' },
      { status: 'blocked_suppressed' },
    );

    const res = await authed(recipientUser.accessToken).get('/v1/received');
    expect(res.body.data).toHaveLength(0);
  });

  it('reports a received capsule and writes an audit event, but 404s for a non-owned recipient row', async () => {
    const recipientUser = await createSignedUpUser();
    const stranger = await createSignedUpUser();
    const owner = await createOwner();
    const { recipient } = await createCapsuleForRecipient(owner.id, recipientUser.userId, { state: 'unlocked' });

    const forbidden = await authed(stranger.accessToken)
      .post(`/v1/received/${recipient.id}/report`)
      .send({ reason: 'spam' });
    expect(forbidden.status).toBe(404);

    const res = await authed(recipientUser.accessToken)
      .post(`/v1/received/${recipient.id}/report`)
      .send({ reason: 'harassment', details: 'unwanted contact' });
    expect(res.status).toBe(204);

    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.action, 'capsule.reported')).limit(1);
    expect(event).toBeTruthy();
  });
});
