import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import express from 'express';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { sessions, users } from '../../db/schema/index.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { LOG_REDACT_OPTIONS } from '../../logger.js';
import { authRouter } from './index.js';
import { issuePasswordResetToken } from './otp.js';

/**
 * E1.1 — backend recovery foundation (plan/STAGE-E-MOBILE-V1-E0.5-RECOVERY-
 * FLOW-SPIKE.md §5/§18). Covers only what changed here: the optional
 * masterKeyWrap on password reset, and the new recovery-key lookup
 * endpoint. The pre-existing "resets a forgotten password" test in
 * auth.test.ts already covers the legacy (no masterKeyWrap) path end to
 * end and is left untouched — this file adds what's new, not a duplicate.
 */

const createdUserIds: string[] = [];
const PASSWORD = 'correct-horse-battery-staple';
const MASTER_KEY_WRAP = 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=';
const RECOVERY_KEY_WRAP = 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==';

function uniqueEmail(): string {
  return `recovery-test-${randomUUID()}@example.com`;
}

type App = ReturnType<typeof createApp>;

async function signupAndVerify(app: App, email: string) {
  const signupRes = await request(app).post('/v1/auth/signup').send({
    email,
    password: PASSWORD,
    displayName: 'Test User',
    masterKeyWrap: MASTER_KEY_WRAP,
    recoveryKeyWrap: RECOVERY_KEY_WRAP,
  });
  expect(signupRes.status).toBe(201);
  createdUserIds.push(signupRes.body.user.id);
  return signupRes.body as { user: { id: string }; tokens: { accessToken: string } };
}

describe('password recovery (E1.1)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('reset without masterKeyWrap leaves the existing masterKeyWrap untouched (legacy behavior, explicitly proven)', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);

    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);
    const reset = await request(app).post('/v1/auth/password/reset').send({ token: resetToken, newPassword: 'a-different-password-1' });
    expect(reset.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, signup.user.id));
    // The account is reachable under the new password, but the OLD
    // masterKeyWrap is still there, unreadable under it — exactly the
    // accepted "lose password + no recovery code = historical content
    // unrecoverable" consequence, not silently papered over.
    expect(row?.masterKeyWrap?.toString('base64')).toBe(MASTER_KEY_WRAP);
  });

  it('reset with masterKeyWrap (recovery path) persists the replacement atomically with the password change', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);
    const newWrap = 'cmVjb3ZlcmVkLWFuZC1yZXdyYXBwZWQtbWFzdGVyLWtleQ==';

    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);
    const reset = await request(app)
      .post('/v1/auth/password/reset')
      .send({ token: resetToken, newPassword: 'recovered-password-1', masterKeyWrap: newWrap });
    expect(reset.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, signup.user.id));
    expect(row?.masterKeyWrap?.toString('base64')).toBe(newWrap);

    const login = await request(app).post('/v1/auth/login').send({ email, password: 'recovered-password-1' });
    expect(login.status).toBe(200);
    expect(login.body.user.masterKeyWrap).toBe(newWrap);
    // No plaintext key or recovery code ever appears anywhere in this
    // request/response cycle — only opaque, client-supplied ciphertext.
    expect(JSON.stringify(reset.body)).not.toContain(RECOVERY_KEY_WRAP);
  });

  it('recoveryKeyWrap is unavailable without a valid reset token, and returns only the minimum shape with one', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);

    const badToken = await request(app).post('/v1/auth/password/reset/recovery-key').send({ token: 'not-a-real-token' });
    expect(badToken.status).toBe(400);
    expect(badToken.body.error.code).toBe('invalid_or_expired_code');
    // Same generic shape a bad token gets from /auth/password/reset itself —
    // this endpoint reveals nothing a bad token there doesn't already.
    expect(JSON.stringify(badToken.body)).not.toContain(RECOVERY_KEY_WRAP);

    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);
    const ok = await request(app).post('/v1/auth/password/reset/recovery-key').send({ token: resetToken });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ recoveryKeyWrap: RECOVERY_KEY_WRAP });
    expect(Object.keys(ok.body)).toEqual(['recoveryKeyWrap']);
  });

  it('the recovery-key lookup does not consume the reset token — the same token still finalizes the reset afterward', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);
    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);

    const lookup1 = await request(app).post('/v1/auth/password/reset/recovery-key').send({ token: resetToken });
    expect(lookup1.status).toBe(200);
    const lookup2 = await request(app).post('/v1/auth/password/reset/recovery-key').send({ token: resetToken });
    expect(lookup2.status).toBe(200);

    const reset = await request(app).post('/v1/auth/password/reset').send({ token: resetToken, newPassword: 'still-works-after-lookup-1' });
    expect(reset.status).toBe(200);
  });

  it('a reset token cannot be reused once the reset itself has consumed it (existing single-use semantics, unchanged)', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);
    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);

    const first = await request(app).post('/v1/auth/password/reset').send({ token: resetToken, newPassword: 'first-use-1' });
    expect(first.status).toBe(200);

    const second = await request(app).post('/v1/auth/password/reset').send({ token: resetToken, newPassword: 'second-use-1' });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('invalid_or_expired_code');

    // A consumed token also can't be used for the recovery-key lookup.
    const lookupAfterConsumed = await request(app).post('/v1/auth/password/reset/recovery-key').send({ token: resetToken });
    expect(lookupAfterConsumed.status).toBe(400);
  });

  it('recoveryKeyWrap never appears in normal signup/login/me responses; masterKeyWrap does (existing, intentional)', async () => {
    const app = createApp(db);
    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);

    const login = await request(app).post('/v1/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);

    const me = await request(app).get('/v1/me').set('Authorization', `Bearer ${signup.tokens.accessToken}`);
    expect(me.status).toBe(200);

    for (const body of [signup, login.body, me.body]) {
      expect(body.user).not.toHaveProperty('recoveryKeyWrap');
      expect(JSON.stringify(body)).not.toContain(RECOVERY_KEY_WRAP);
    }
    // masterKeyWrap IS expected here — the client needs it to unwrap the
    // master key locally. Its presence is correct, pre-existing behavior,
    // not something this change should hide.
    expect(login.body.user.masterKeyWrap).toBe(MASTER_KEY_WRAP);
    expect(me.body.user.masterKeyWrap).toBe(MASTER_KEY_WRAP);
  });

  it('no recovery material (token, masterKeyWrap, or recoveryKeyWrap) reaches the request log', async () => {
    // logger.ts's own singleton logs to a pino-pretty worker transport that
    // can't be synchronously inspected in-process — same constraint
    // logger.test.ts already documents — so this builds a second, throwaway
    // pino instance from the exact same LOG_REDACT_OPTIONS, wired through
    // the real authRouter and errorHandler this app actually uses, and
    // makes real requests carrying recognizable secret-shaped values.
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = pino({ redact: LOG_REDACT_OPTIONS }, sink);

    const app = express();
    app.use(express.json());
    app.use(pinoHttp({ logger }));
    app.use('/v1', authRouter(db));
    app.use(errorHandler);

    const email = uniqueEmail();
    const signup = await signupAndVerify(app, email);
    const resetToken = await issuePasswordResetToken(db, signup.user.id, email);
    const newWrap = 'bG9nLXRlc3QtbmV3LXdyYXA=';

    await request(app).post('/v1/auth/password/reset/recovery-key').send({ token: resetToken });
    await request(app).post('/v1/auth/password/reset').send({ token: resetToken, newPassword: 'logged-nowhere-1', masterKeyWrap: newWrap });
    await new Promise((resolve) => setImmediate(resolve));

    const output = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0); // sanity: something was actually logged
    expect(output).not.toContain(resetToken);
    expect(output).not.toContain(RECOVERY_KEY_WRAP);
    expect(output).not.toContain(newWrap);
    expect(output).not.toContain('logged-nowhere-1');
  });
});
