import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsuleRecipients, capsules, entitlements, scheduledActions, users } from '../../db/schema/index.js';

const app = createApp(db);
const createdUserIds: string[] = [];
const createdCapsuleIds: string[] = [];

function uniqueEmail(prefix = 'settings-test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

const PASSWORD = 'correct-horse-battery-staple';

async function createUser() {
  const email = uniqueEmail();
  const signupRes = await request(app)
    .post('/v1/auth/signup')
    .send({
      email,
      password: PASSWORD,
      displayName: 'Test User',
      masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
      recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
    });
  expect(signupRes.status).toBe(201);
  const userId = signupRes.body.user.id as string;
  createdUserIds.push(userId);
  return { userId, email, accessToken: signupRes.body.tokens.accessToken as string };
}

function authed(token: string) {
  return {
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

async function sealedCapsuleWithRecipient(ownerId: string, overrides: Partial<typeof capsules.$inferInsert> = {}) {
  const [capsule] = await db
    .insert(capsules)
    .values({
      ownerId,
      type: 'personal',
      publicId: randomUUID().slice(0, 8).toUpperCase(),
      state: 'sealed',
      title: 'Sealed With Recipient',
      ...overrides,
    })
    .returning();
  createdCapsuleIds.push(capsule!.id);
  await db.insert(capsuleRecipients).values({
    capsuleId: capsule!.id,
    email: uniqueEmail('recip'),
    accessTokenHash: randomUUID(),
    status: 'added',
  });
  return capsule!;
}

describe('settings module (T-18)', () => {
  afterAll(async () => {
    for (const id of createdCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of createdUserIds) {
      await db.delete(scheduledActions).where(eq(scheduledActions.subjectId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('GET /me/storage reports usedBytes/quotaBytes/largest', async () => {
    const { userId, accessToken } = await createUser();
    const [capsule] = await db
      .insert(capsules)
      .values({
        ownerId: userId,
        type: 'personal',
        publicId: randomUUID().slice(0, 8).toUpperCase(),
        state: 'draft',
        sizeBytes: 1024,
      })
      .returning();
    createdCapsuleIds.push(capsule!.id);

    const res = await authed(accessToken).get('/v1/me/storage');
    expect(res.status).toBe(200);
    expect(res.body.usedBytes).toBeGreaterThanOrEqual(1024);
    expect(res.body.quotaBytes).toBe(100 * 1024 * 1024); // free plan default
    expect(res.body.largest.length).toBeGreaterThan(0);
  });

  it('POST /me/avatar returns a signed upload URL and a key scoped to the user', async () => {
    const { userId, accessToken } = await createUser();
    const res = await authed(accessToken).post('/v1/me/avatar').send({ contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain('fake-storage.test');
    expect(res.body.avatarKey).toContain(`avatars/${userId}/`);
  });

  it('POST /me/export dedupes a still-pending job instead of creating a second one', async () => {
    const { accessToken } = await createUser();
    const first = await authed(accessToken).post('/v1/me/export').send({});
    expect(first.status).toBe(202);
    const second = await authed(accessToken).post('/v1/me/export').send({});
    expect(second.status).toBe(202);
    expect(second.body.jobId).toBe(first.body.jobId);
  });

  it('GET /me/deletion-preview lists only sealed capsules with real recipients', async () => {
    const { userId, accessToken } = await createUser();
    const needsDecision = await sealedCapsuleWithRecipient(userId);
    // A draft has no delivery obligation — shouldn't show up.
    const [draft] = await db
      .insert(capsules)
      .values({ ownerId: userId, type: 'personal', publicId: randomUUID().slice(0, 8).toUpperCase(), state: 'draft' })
      .returning();
    createdCapsuleIds.push(draft!.id);

    const res = await authed(accessToken).get('/v1/me/deletion-preview');
    expect(res.status).toBe(200);
    const ids = res.body.needsDecision.map((c: { id: string }) => c.id);
    expect(ids).toContain(needsDecision.id);
    expect(ids).not.toContain(draft!.id);
  });

  it('DELETE /me rejects a missing decision, applies withdraw immediately, and marks deliver for later', async () => {
    const { userId, accessToken } = await createUser();
    const toWithdraw = await sealedCapsuleWithRecipient(userId);
    const toDeliver = await sealedCapsuleWithRecipient(userId);

    const missing = await authed(accessToken)
      .delete('/v1/me')
      .send({ password: PASSWORD, capsuleDecisions: [{ capsuleId: toWithdraw.id, action: 'withdraw' }] });
    expect(missing.status).toBe(400);

    const wrongPassword = await authed(accessToken)
      .delete('/v1/me')
      .send({
        password: 'nope',
        capsuleDecisions: [
          { capsuleId: toWithdraw.id, action: 'withdraw' },
          { capsuleId: toDeliver.id, action: 'deliver' },
        ],
      });
    expect(wrongPassword.status).toBe(401);

    const res = await authed(accessToken)
      .delete('/v1/me')
      .send({
        password: PASSWORD,
        capsuleDecisions: [
          { capsuleId: toWithdraw.id, action: 'withdraw' },
          { capsuleId: toDeliver.id, action: 'deliver' },
        ],
      });
    expect(res.status).toBe(202);

    const [withdrawnRow] = await db.select().from(capsules).where(eq(capsules.id, toWithdraw.id));
    expect(withdrawnRow?.state).toBe('withdrawn');

    const [deliverRow] = await db.select().from(capsules).where(eq(capsules.id, toDeliver.id));
    expect(deliverRow?.state).toBe('sealed');
    expect(deliverRow?.deletionDecision).toBe('deliver');

    const [userRow] = await db.select().from(users).where(eq(users.id, userId));
    expect(userRow?.status).toBe('pending_deletion');

    const [purgeAction] = await db
      .select()
      .from(scheduledActions)
      .where(eq(scheduledActions.subjectId, userId));
    expect(purgeAction?.kind).toBe('account_purge');
  });

  it('logging back in cancels a pending deletion and clears the deliver-decision flags', async () => {
    const { userId, email, accessToken } = await createUser();
    const toDeliver = await sealedCapsuleWithRecipient(userId);

    const deleteRes = await authed(accessToken)
      .delete('/v1/me')
      .send({ password: PASSWORD, capsuleDecisions: [{ capsuleId: toDeliver.id, action: 'deliver' }] });
    expect(deleteRes.status).toBe(202);

    const [pending] = await db.select().from(users).where(eq(users.id, userId));
    expect(pending?.status).toBe('pending_deletion');

    const loginRes = await request(app).post('/v1/auth/login').send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.status).toBe('active');

    const [afterLogin] = await db.select().from(users).where(eq(users.id, userId));
    expect(afterLogin?.status).toBe('active');
    expect(afterLogin?.deletionRequestedAt).toBeNull();

    const [capsuleAfter] = await db.select().from(capsules).where(eq(capsules.id, toDeliver.id));
    expect(capsuleAfter?.deletionDecision).toBeNull();

    const [purgeAction] = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, userId));
    expect(purgeAction?.state).toBe('cancelled');
  });
});
