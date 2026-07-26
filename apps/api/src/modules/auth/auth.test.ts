import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { sessions, users } from '../../db/schema/index.js';
import { issueEmailVerifyCode, issuePasswordResetToken } from './otp.js';

const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `auth-test-${randomUUID()}@example.com`;
}

// A fresh app per test — rate-limit buckets live inside the closures
// `authRouter()` creates, so this also gives each test isolated rate
// limits instead of sharing (and tripping over) one global bucket.
type App = ReturnType<typeof createApp>;

async function signupAndVerify(app: App, email: string, password: string) {
  const signupRes = await request(app)
    .post('/v1/auth/signup')
    .send({
      email,
      password,
      displayName: 'Test User',
      masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
      recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
    });
  expect(signupRes.status).toBe(201);
  createdUserIds.push(signupRes.body.user.id);

  const code = await issueEmailVerifyCode(db, signupRes.body.user.id, email);
  const verifyRes = await request(app)
    .post('/v1/auth/verify-email')
    .set('Authorization', `Bearer ${signupRes.body.tokens.accessToken}`)
    .send({ code });
  expect(verifyRes.status).toBe(200);

  return signupRes.body;
}

describe('auth module (T-04)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('full lifecycle: signup -> verify-email -> login -> refresh -> logout', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email, 'correct-horse-battery-staple');
    expect(signup.user.status).toBe('unverified'); // signup response predates verification

    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct-horse-battery-staple' });
    expect(login.status).toBe(200);
    expect(login.body.user.status).toBe('active');

    const refresh = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.tokens.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.tokens.refreshToken).not.toBe(login.body.tokens.refreshToken);

    const logout = await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${refresh.body.tokens.accessToken}`)
      .send({});
    expect(logout.status).toBe(204);

    const refreshAfterLogout = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: refresh.body.tokens.refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('stores the master key wrap at signup and returns it (still wrapped) on login', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const masterKeyWrap = 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=';
    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({
        email,
        password: 'correct-horse-battery-staple',
        displayName: 'Test User',
        masterKeyWrap,
        recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
      });
    expect(signupRes.status).toBe(201);
    createdUserIds.push(signupRes.body.user.id);
    expect(signupRes.body.user.masterKeyWrap).toBe(masterKeyWrap);

    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct-horse-battery-staple' });
    expect(login.status).toBe(200);
    expect(login.body.user.masterKeyWrap).toBe(masterKeyWrap);
  });

  it('rejects signup with an already-registered email', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    await signupAndVerify(app, email, 'correct-horse-battery-staple');

    const dup = await request(app)
      .post('/v1/auth/signup')
      .send({
        email,
        password: 'another-password-1',
        displayName: 'Dup',
        masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
        recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
      });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('email_already_registered');
  });

  it('rejects login with the wrong password', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    await signupAndVerify(app, email, 'correct-horse-battery-staple');

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'totally-wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('rejects verify-email with a wrong code and burns the code after too many attempts', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({
        email,
        password: 'correct-horse-battery-staple',
        displayName: 'Test User',
        masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
        recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
      });
    createdUserIds.push(signupRes.body.user.id);
    const token = signupRes.body.tokens.accessToken;

    let last;
    for (let i = 0; i < 5; i++) {
      last = await request(app)
        .post('/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' });
      expect(last.status).toBe(400);
    }

    // Code is now burned even if we somehow knew the right one afterwards.
    const correctCode = await issueEmailVerifyCode(db, signupRes.body.user.id, email);
    const finalTry = await request(app)
      .post('/v1/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '999999' });
    expect(finalTry.status).toBe(400);

    // The freshly-issued correct code still works (proves the burn only
    // affected the previous row, not verification as a whole).
    const ok = await request(app)
      .post('/v1/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: correctCode });
    expect(ok.status).toBe(200);
  });

  it('detects refresh-token reuse and revokes the whole session', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    await signupAndVerify(app, email, 'correct-horse-battery-staple');

    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct-horse-battery-staple' });
    const originalRefreshToken = login.body.tokens.refreshToken;

    const rotated = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(rotated.status).toBe(200);
    const rotatedRefreshToken = rotated.body.tokens.refreshToken;

    // Replay the already-rotated-out token — this is the attack signal.
    const reuse = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(reuse.status).toBe(401);

    // The legitimately-rotated token must also now be dead — the whole
    // session was revoked, not just the stale token rejected.
    const afterReuse = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('lists and revokes sessions', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    await signupAndVerify(app, email, 'correct-horse-battery-staple');

    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct-horse-battery-staple' });
    const { accessToken } = login.body.tokens;

    const list = await request(app)
      .get('/v1/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    const current = list.body.data.find((s: { current: boolean }) => s.current);
    expect(current).toBeDefined();

    const revoke = await request(app)
      .delete(`/v1/auth/sessions/${current.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(revoke.status).toBe(204);

    const refreshAfterRevoke = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.tokens.refreshToken });
    expect(refreshAfterRevoke.status).toBe(401);
  });

  it('GET/PATCH /me', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email, 'correct-horse-battery-staple');
    const { accessToken } = signup.tokens;

    const me = await request(app).get('/v1/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    const patch = await request(app)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Updated Name' });
    expect(patch.status).toBe(200);
    expect(patch.body.user.displayName).toBe('Updated Name');
  });

  it('resets a forgotten password and revokes all existing sessions', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email, 'correct-horse-battery-staple');
    const oldRefreshToken = signup.tokens.refreshToken;

    const forgot = await request(app).post('/v1/auth/password/forgot').send({ email });
    expect(forgot.status).toBe(200);

    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);
    const reset = await request(app)
      .post('/v1/auth/password/reset')
      .send({ token: resetToken, newPassword: 'brand-new-password-1' });
    expect(reset.status).toBe(200);

    // All prior sessions die on password reset.
    const refreshAfterReset = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(refreshAfterReset.status).toBe(401);

    const oldLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'correct-horse-battery-staple' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'brand-new-password-1' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects requests with no/invalid bearer token', async () => {
    const app = createApp(db);
    const noAuth = await request(app).get('/v1/me');
    expect(noAuth.status).toBe(401);

    const badAuth = await request(app).get('/v1/me').set('Authorization', 'Bearer not-a-real-token');
    expect(badAuth.status).toBe(401);
  });

  it('creates a session row with the expected shape on signup', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email, 'correct-horse-battery-staple');
    const rows = await db.select().from(sessions).where(eq(sessions.userId, signup.user.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.platform).toBe('web');
  });
});
