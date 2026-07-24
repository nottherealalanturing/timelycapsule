import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtKeys } from './keys.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ISSUER = 'timelycapsule';

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const { privateKey } = await getJwtKeys();
  return new SignJWT({ sid: payload.sessionId })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(privateKey);
}

/** Throws (jose's verification error) if the token is missing, malformed, expired, or forged. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { publicKey } = await getJwtKeys();
  const { payload } = await jwtVerify(token, publicKey, { issuer: ISSUER });
  return { userId: payload.sub as string, sessionId: payload.sid as string };
}

/** Opaque, high-entropy refresh token. Only its SHA-256 hash is ever persisted. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
