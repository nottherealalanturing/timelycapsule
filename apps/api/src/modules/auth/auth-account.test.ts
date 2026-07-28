import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { sessions, users } from '../../db/schema/index.js';
import { issueChangeEmailCode } from './otp.js';

const createdUserIds: string[] = [];
const PASSWORD = 'correct-horse-battery-staple';

function uniqueEmail(prefix = 'account-test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

// A fresh app per test — rate-limit buckets live inside authRouter()'s
// closures, so this also isolates each test's rate limits (same pattern as
// auth.test.ts).
async function createUser() {
  const app = createApp(db);
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
  return { app, userId, email, accessToken: signupRes.body.tokens.accessToken as string };
}

function authed(app: ReturnType<typeof createApp>, token: string) {
  return {
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  };
}

describe('auth module — password/email change (T-18)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('changes the password, re-wraps the master key, and keeps the current session alive', async () => {
    const { app, userId, accessToken } = await createUser();

    const wrongCurrent = await authed(app, accessToken)
      .post('/v1/auth/password/change')
      .send({ currentPassword: 'nope', newPassword: 'a-new-strong-password', masterKeyWrap: 'bmV3LXdyYXA=' });
    expect(wrongCurrent.status).toBe(401);

    const res = await authed(app, accessToken)
      .post('/v1/auth/password/change')
      .send({ currentPassword: PASSWORD, newPassword: 'a-new-strong-password', masterKeyWrap: 'bmV3LXdyYXA=' });
    expect(res.status).toBe(204);

    // The session used to make the change is still valid afterward.
    const meRes = await authed(app, accessToken).get('/v1/me');
    expect(meRes.status).toBe(200);

    const [userRow] = await db.select().from(users).where(eq(users.id, userId));
    expect(userRow?.masterKeyWrap?.toString('base64')).toBe('bmV3LXdyYXA=');

    const loginRes = await request(app).post('/v1/auth/login').send({ email: meRes.body.user.email, password: 'a-new-strong-password' });
    expect(loginRes.status).toBe(200);
  });

  it('stages a new email, requires the correct code to confirm, and rejects an already-registered address', async () => {
    const owner = await createUser();
    const stranger = await createUser();

    const dupRes = await authed(owner.app, owner.accessToken)
      .post('/v1/me/email/change')
      .send({ newEmail: stranger.email, currentPassword: PASSWORD });
    expect(dupRes.status).toBe(409);

    const newEmail = uniqueEmail('new');
    const requestRes = await authed(owner.app, owner.accessToken)
      .post('/v1/me/email/change')
      .send({ newEmail, currentPassword: PASSWORD });
    expect(requestRes.status).toBe(202);

    const [pending] = await db.select().from(users).where(eq(users.id, owner.userId));
    expect(pending?.pendingEmail).toBe(newEmail);

    const wrongCode = await authed(owner.app, owner.accessToken).post('/v1/me/email/confirm').send({ code: '000000' });
    expect(wrongCode.status).toBe(400);

    const code = await issueChangeEmailCode(db, owner.userId, newEmail);
    const confirmRes = await authed(owner.app, owner.accessToken).post('/v1/me/email/confirm').send({ code });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.user.email).toBe(newEmail);
    expect(confirmRes.body.user.pendingEmail).toBeNull();
  });
});
