import { and, desc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { sessions } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../logger.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from './tokens.js';

export interface DeviceMeta {
  platform: 'web' | 'ios' | 'android';
  ip: string | null;
  userAgent: string | null;
  deviceName?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

type Session = typeof sessions.$inferSelect;

export async function createSession(
  db: Database,
  userId: string,
  meta: DeviceMeta,
): Promise<{ session: Session; tokens: IssuedTokens }> {
  const raw = generateRefreshToken();
  const rows = await db
    .insert(sessions)
    .values({
      userId,
      refreshTokenHash: hashRefreshToken(raw),
      platform: meta.platform,
      ip: meta.ip,
      userAgent: meta.userAgent,
      deviceName: meta.deviceName ?? null,
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    .returning();
  const session = rows[0]!;

  const accessToken = await signAccessToken({ userId, sessionId: session.id });
  return {
    session,
    tokens: { accessToken, refreshToken: raw, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  };
}

/**
 * Rotates a refresh token. If the presented token matches the session's
 * *previous* hash (i.e. it was already rotated out once before), that's a
 * replay/theft signal — the whole session is revoked immediately rather
 * than issuing new tokens (plan/03-ARCHITECTURE.md §17, threat #3).
 */
export async function rotateRefreshToken(
  db: Database,
  rawToken: string,
): Promise<{ userId: string; tokens: IssuedTokens }> {
  const hash = hashRefreshToken(rawToken);

  const [session] = await db
    .select()
    .from(sessions)
    .where(or(eq(sessions.refreshTokenHash, hash), eq(sessions.previousRefreshTokenHash, hash)))
    .limit(1);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  if (session.previousRefreshTokenHash === hash) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    logger.warn(
      { event: 'refresh_token_reuse_detected', sessionId: session.id, userId: session.userId },
      'Refresh token reuse detected — session revoked',
    );
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const newRaw = generateRefreshToken();
  await db
    .update(sessions)
    .set({
      refreshTokenHash: hashRefreshToken(newRaw),
      previousRefreshTokenHash: hash,
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    .where(eq(sessions.id, session.id));

  const accessToken = await signAccessToken({ userId: session.userId, sessionId: session.id });
  return {
    userId: session.userId,
    tokens: { accessToken, refreshToken: newRaw, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  };
}

export async function revokeSession(db: Database, userId: string, sessionId: string): Promise<void> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  if (result.length === 0) {
    throw ApiError.notFound('Session not found');
  }
}

/** Used on password reset — force re-login on every device (plan §17, threat #3). */
export async function revokeAllSessions(db: Database, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** T-18's in-session password change: the caller already re-proved their identity with the current password, so their own session stays alive — every *other* device still gets signed out (plan §17, threat #3). */
export async function revokeOtherSessions(db: Database, userId: string, keepSessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, keepSessionId)));
}

export async function listActiveSessions(db: Database, userId: string): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastUsedAt));
}

/** Stub per T-04 ticket text — real notification email lands in T-07. */
export async function isNewDevice(db: Database, userId: string, meta: DeviceMeta): Promise<boolean> {
  const matchers = [
    meta.ip ? eq(sessions.ip, meta.ip) : undefined,
    meta.userAgent ? eq(sessions.userAgent, meta.userAgent) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  if (matchers.length === 0) {
    return true;
  }

  const [existing] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), or(...matchers)))
    .limit(1);

  return !existing;
}
