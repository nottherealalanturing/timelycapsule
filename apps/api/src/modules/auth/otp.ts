import { randomBytes, randomInt, createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { emailOtpCodes } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { sendPasswordReset, sendVerifyEmailCode } from '../email/index.js';

const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function hashOtp(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** 6-digit numeric code for email verification, delivered via modules/email (T-07). */
export async function issueEmailVerifyCode(
  db: Database,
  userId: string,
  email: string,
): Promise<string> {
  await db
    .delete(emailOtpCodes)
    .where(and(eq(emailOtpCodes.userId, userId), eq(emailOtpCodes.purpose, 'verify_email'), isNull(emailOtpCodes.usedAt)));

  const raw = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await db.insert(emailOtpCodes).values({
    userId,
    purpose: 'verify_email',
    codeHash: hashOtp(raw),
    expiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
  });

  await sendVerifyEmailCode(db, email, raw);
  return raw;
}

export async function consumeEmailVerifyCode(db: Database, userId: string, code: string): Promise<void> {
  const [row] = await db
    .select()
    .from(emailOtpCodes)
    .where(
      and(
        eq(emailOtpCodes.userId, userId),
        eq(emailOtpCodes.purpose, 'verify_email'),
        isNull(emailOtpCodes.usedAt),
        gt(emailOtpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emailOtpCodes.createdAt))
    .limit(1);

  if (!row) {
    throw ApiError.invalidOrExpiredCode();
  }

  if (row.codeHash !== hashOtp(code)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      // Burn the code after too many wrong guesses — caller must resend.
      await db.delete(emailOtpCodes).where(eq(emailOtpCodes.id, row.id));
    } else {
      await db.update(emailOtpCodes).set({ attempts }).where(eq(emailOtpCodes.id, row.id));
    }
    throw ApiError.invalidOrExpiredCode();
  }

  await db.update(emailOtpCodes).set({ usedAt: new Date() }).where(eq(emailOtpCodes.id, row.id));
}

/** Same shape as issueEmailVerifyCode, sent to the *staged* new address instead of the account's current one (T-18's Settings → Account email change). */
export async function issueChangeEmailCode(db: Database, userId: string, newEmail: string): Promise<string> {
  await db
    .delete(emailOtpCodes)
    .where(and(eq(emailOtpCodes.userId, userId), eq(emailOtpCodes.purpose, 'change_email'), isNull(emailOtpCodes.usedAt)));

  const raw = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await db.insert(emailOtpCodes).values({
    userId,
    purpose: 'change_email',
    codeHash: hashOtp(raw),
    expiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
  });

  await sendVerifyEmailCode(db, newEmail, raw);
  return raw;
}

export async function consumeChangeEmailCode(db: Database, userId: string, code: string): Promise<void> {
  const [row] = await db
    .select()
    .from(emailOtpCodes)
    .where(
      and(
        eq(emailOtpCodes.userId, userId),
        eq(emailOtpCodes.purpose, 'change_email'),
        isNull(emailOtpCodes.usedAt),
        gt(emailOtpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emailOtpCodes.createdAt))
    .limit(1);

  if (!row) {
    throw ApiError.invalidOrExpiredCode();
  }

  if (row.codeHash !== hashOtp(code)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await db.delete(emailOtpCodes).where(eq(emailOtpCodes.id, row.id));
    } else {
      await db.update(emailOtpCodes).set({ attempts }).where(eq(emailOtpCodes.id, row.id));
    }
    throw ApiError.invalidOrExpiredCode();
  }

  await db.update(emailOtpCodes).set({ usedAt: new Date() }).where(eq(emailOtpCodes.id, row.id));
}

/**
 * Opaque token for password reset — long/random enough that it's looked up
 * by hash alone (no userId scoping needed, unlike the numeric verify code),
 * so brute-force attempt tracking isn't necessary here.
 */
export async function issuePasswordResetToken(
  db: Database,
  userId: string,
  email: string,
): Promise<string> {
  await db
    .delete(emailOtpCodes)
    .where(and(eq(emailOtpCodes.userId, userId), eq(emailOtpCodes.purpose, 'password_reset'), isNull(emailOtpCodes.usedAt)));

  const raw = randomBytes(32).toString('base64url');
  await db.insert(emailOtpCodes).values({
    userId,
    purpose: 'password_reset',
    codeHash: hashOtp(raw),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const resetUrl = `${process.env.APP_URL ?? 'http://localhost:3001'}/reset?token=${raw}`;
  await sendPasswordReset(db, email, resetUrl);
  return raw;
}

/** Shared lookup for both the non-consuming peek and the consuming finalize below — same validity criteria, one place to keep them in sync. */
async function lookupPasswordResetToken(db: Database, token: string) {
  const [row] = await db
    .select()
    .from(emailOtpCodes)
    .where(
      and(
        eq(emailOtpCodes.purpose, 'password_reset'),
        eq(emailOtpCodes.codeHash, hashOtp(token)),
        isNull(emailOtpCodes.usedAt),
        gt(emailOtpCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    throw ApiError.invalidOrExpiredCode();
  }
  return row;
}

/**
 * Returns the owning userId without consuming the token — used by the
 * recovery-key lookup step (E0.5 §5/§18), which must not burn the token
 * since the same token is still needed for the actual
 * `consumePasswordResetToken` call once the user submits their new
 * password. Same validity criteria as the consuming version, so a token
 * that passes this check is guaranteed to still work for the real reset.
 */
export async function verifyPasswordResetToken(db: Database, token: string): Promise<string> {
  const row = await lookupPasswordResetToken(db, token);
  return row.userId;
}

/** Returns the owning userId, or throws if the token is unknown/used/expired. */
export async function consumePasswordResetToken(db: Database, token: string): Promise<string> {
  const row = await lookupPasswordResetToken(db, token);
  await db.update(emailOtpCodes).set({ usedAt: new Date() }).where(eq(emailOtpCodes.id, row.id));
  return row.userId;
}
