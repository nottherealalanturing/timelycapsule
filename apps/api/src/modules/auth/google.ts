import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ApiError } from '../../lib/errors.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let cachedJwks: JWTVerifyGetKey | undefined;

function googleJwks(): JWTVerifyGetKey {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return cachedJwks;
}

export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Verifies a Google Identity Services idToken (signature, issuer, audience,
 * expiry — all via `jose`). `jwks` is injectable so tests can verify against
 * a locally-generated keypair instead of hitting Google's real endpoint.
 */
/**
 * NODE_ENV=test fallback for GOOGLE_OAUTH_WEB_CLIENT_ID — exported so
 * google-oauth.test.ts signs fake idTokens against this exact same audience
 * value rather than each side independently reading process.env (which is
 * what silently broke in real CI, where no apps/api/.env file exists).
 */
export const TEST_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

export async function verifyGoogleIdToken(
  idToken: string,
  jwks: JWTVerifyGetKey = googleJwks(),
): Promise<GoogleIdTokenPayload> {
  // Ephemeral value under NODE_ENV=test — same pattern as T-04's JWT keys —
  // so CI/local test runs need zero real config; tests inject their own
  // `jwks` above and sign fake idTokens against this same audience value.
  const clientId =
    process.env.GOOGLE_OAUTH_WEB_CLIENT_ID ?? (process.env.NODE_ENV === 'test' ? TEST_GOOGLE_CLIENT_ID : undefined);
  if (!clientId) {
    throw new Error('GOOGLE_OAUTH_WEB_CLIENT_ID is not set');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    }));
  } catch {
    throw ApiError.unauthorized('Invalid Google idToken');
  }

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw ApiError.unauthorized('Invalid Google idToken');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : payload.email,
  };
}
