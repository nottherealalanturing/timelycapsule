import type { AuthResponse, PatchMeRequest, User } from '@tc/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { oauthAccounts, users } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { sendNewDeviceAlert } from '../email/index.js';
import { claimGhostRecipients } from './ghost-claim.js';
import { claimGuestSession } from '../guest/index.js';
import { verifyGoogleIdToken, type GoogleIdTokenPayload } from './google.js';
import {
  consumeChangeEmailCode,
  consumeEmailVerifyCode,
  consumePasswordResetToken,
  issueChangeEmailCode,
  issueEmailVerifyCode,
  issuePasswordResetToken,
} from './otp.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  createSession,
  isNewDevice,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  rotateRefreshToken,
  type DeviceMeta,
  type IssuedTokens,
} from './sessions.js';

type UserRow = typeof users.$inferSelect;

function toUserResponse(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    pendingEmail: user.pendingEmail,
    displayName: user.displayName,
    handle: user.handle,
    avatarKey: user.avatarKey,
    timezone: user.timezone,
    locale: user.locale,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    masterKeyWrap: user.masterKeyWrap ? user.masterKeyWrap.toString('base64') : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function signup(
  db: Database,
  input: { email: string; password: string; displayName: string; masterKeyWrap: string; recoveryKeyWrap: string; guestToken?: string },
  meta: DeviceMeta,
): Promise<AuthResponse> {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) {
    throw ApiError.emailAlreadyRegistered();
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      status: 'unverified',
      masterKeyWrap: Buffer.from(input.masterKeyWrap, 'base64'),
      recoveryKeyWrap: Buffer.from(input.recoveryKeyWrap, 'base64'),
    })
    .returning() as [UserRow];

  await issueEmailVerifyCode(db, user.id, user.email);
  await claimGuestSession(db, user.id, input.guestToken);
  const { tokens } = await createSession(db, user.id, meta);

  return { user: toUserResponse(user), tokens };
}

export async function login(
  db: Database,
  input: { email: string; password: string },
  meta: DeviceMeta,
): Promise<AuthResponse> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user || !user.passwordHash) {
    throw ApiError.invalidCredentials();
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw ApiError.invalidCredentials();
  }

  if (user.status === 'suspended' || user.status === 'deleted') {
    throw ApiError.forbidden('Account is not active');
  }

  if (await isNewDevice(db, user.id, meta)) {
    await sendNewDeviceAlert(db, user.email, meta.ip);
  }

  // F8: "30-day pending window (login cancels)" — a successful login is the
  // cancellation trigger. Dynamic import to avoid a static circular
  // dependency (modules/settings imports back from modules/auth for
  // verifyPassword) — same reasoning as T-17's purgeCapsuleNow.
  let effectiveUser = user;
  if (user.status === 'pending_deletion') {
    const { cancelAccountDeletion } = await import('../settings/index.js');
    await cancelAccountDeletion(db, user.id);
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    effectiveUser = refreshed!;
  }

  const { tokens } = await createSession(db, user.id, meta);
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

  return { user: toUserResponse(effectiveUser), tokens };
}

/**
 * `verify` is injectable so tests can verify against a locally-generated
 * keypair instead of Google's real JWKS endpoint (see google.ts).
 */
export async function googleOAuth(
  db: Database,
  idToken: string,
  meta: DeviceMeta,
  verify: (token: string) => Promise<GoogleIdTokenPayload> = verifyGoogleIdToken,
  guestToken?: string,
): Promise<{ created: boolean } & AuthResponse> {
  const payload = await verify(idToken);
  if (!payload.emailVerified) {
    // We trust Google's verification signal for auto-linking/ghost-claim —
    // if Google itself won't vouch for the email, don't either.
    throw ApiError.unauthorized('Google account email is not verified');
  }

  const [existingLink] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, payload.sub)))
    .limit(1);

  let user: UserRow;
  let created = false;

  if (existingLink) {
    const [linkedUser] = await db.select().from(users).where(eq(users.id, existingLink.userId)).limit(1);
    if (!linkedUser) {
      throw ApiError.notFound('User not found');
    }
    user = linkedUser;
  } else {
    const [existingUser] = await db.select().from(users).where(eq(users.email, payload.email)).limit(1);

    if (existingUser) {
      await db.insert(oauthAccounts).values({
        userId: existingUser.id,
        provider: 'google',
        providerUserId: payload.sub,
      });
      user = existingUser.emailVerifiedAt
        ? existingUser
        : ((await db
            .update(users)
            .set({ emailVerifiedAt: new Date(), status: 'active' })
            .where(eq(users.id, existingUser.id))
            .returning()) as [UserRow])[0];
    } else {
      const [newUser] = (await db
        .insert(users)
        .values({
          email: payload.email,
          displayName: payload.name,
          status: 'active',
          emailVerifiedAt: new Date(),
        })
        .returning()) as [UserRow];
      await db.insert(oauthAccounts).values({
        userId: newUser.id,
        provider: 'google',
        providerUserId: payload.sub,
      });
      user = newUser;
      created = true;
    }

    await claimGhostRecipients(db, user.id, user.email);
  }

  if (user.status === 'suspended' || user.status === 'deleted') {
    throw ApiError.forbidden('Account is not active');
  }

  await claimGuestSession(db, user.id, guestToken);

  if (await isNewDevice(db, user.id, meta)) {
    await sendNewDeviceAlert(db, user.email, meta.ip);
  }

  const { tokens } = await createSession(db, user.id, meta);
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

  return { created, user: toUserResponse(user), tokens };
}

export async function refresh(db: Database, refreshToken: string): Promise<{ tokens: IssuedTokens }> {
  const { tokens } = await rotateRefreshToken(db, refreshToken);
  return { tokens };
}

export async function logout(db: Database, userId: string, sessionId: string): Promise<void> {
  await revokeSession(db, userId, sessionId);
}

export async function verifyEmail(db: Database, userId: string, code: string): Promise<User> {
  await consumeEmailVerifyCode(db, userId, code);
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), status: 'active' })
    .where(eq(users.id, userId))
    .returning() as [UserRow];
  await claimGhostRecipients(db, user.id, user.email);
  return toUserResponse(user);
}

export async function resendVerifyEmail(db: Database, userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.emailVerifiedAt) {
    return;
  }
  await issueEmailVerifyCode(db, user.id, user.email);
}

/** Always resolves without indicating whether the email exists (no account enumeration). */
export async function forgotPassword(db: Database, email: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    await issuePasswordResetToken(db, user.id, user.email);
  }
}

export async function resetPassword(db: Database, token: string, newPassword: string): Promise<void> {
  const userId = await consumePasswordResetToken(db, token);
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await revokeAllSessions(db, userId);
}

export async function getMe(db: Database, userId: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return toUserResponse(user);
}

export async function patchMe(db: Database, userId: string, patch: PatchMeRequest): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return toUserResponse(user);
}

/**
 * Settings → Account password change (T-18) — distinct from forgot/reset:
 * the caller already knows the current password, so `masterKeyWrap` is a
 * client-computed re-wrap (unwrap under the old password, re-wrap under
 * the new one) rather than something only a recovery code could restore.
 * The current session stays alive; every other device is signed out.
 */
export async function changePassword(
  db: Database,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string; masterKeyWrap: string },
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw ApiError.invalidCredentials();
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db
    .update(users)
    .set({ passwordHash, masterKeyWrap: Buffer.from(input.masterKeyWrap, 'base64'), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await revokeOtherSessions(db, userId, sessionId);
}

/**
 * Sets a first encryption password for an OAuth-only account — the account
 * has no passwordHash/masterKeyWrap yet (Google signup never generates one,
 * since there's no password to derive it from), so unlike changePassword
 * there's no existing password to verify and no old key to re-wrap from.
 * Rejects if a password is already set — that account must use
 * changePassword or forgot/reset instead.
 */
export async function setInitialPassword(
  db: Database,
  userId: string,
  input: { newPassword: string; masterKeyWrap: string; recoveryKeyWrap: string },
): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  if (user.passwordHash) {
    throw ApiError.passwordAlreadySet();
  }

  const passwordHash = await hashPassword(input.newPassword);
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      masterKeyWrap: Buffer.from(input.masterKeyWrap, 'base64'),
      recoveryKeyWrap: Buffer.from(input.recoveryKeyWrap, 'base64'),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return toUserResponse(updated!);
}

export async function requestEmailChange(db: Database, userId: string, newEmail: string, currentPassword: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw ApiError.invalidCredentials();
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
  if (existing) {
    throw ApiError.emailAlreadyRegistered();
  }

  await db.update(users).set({ pendingEmail: newEmail, updatedAt: new Date() }).where(eq(users.id, userId));
  await issueChangeEmailCode(db, userId, newEmail);
}

export async function confirmEmailChange(db: Database, userId: string, code: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.pendingEmail) {
    throw ApiError.invalidOrExpiredCode();
  }

  await consumeChangeEmailCode(db, userId, code);

  const [updated] = await db
    .update(users)
    .set({ email: user.pendingEmail, pendingEmail: null, emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return toUserResponse(updated!);
}
