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
export async function verifyGoogleIdToken(
  idToken: string,
  jwks: JWTVerifyGetKey = googleJwks(),
): Promise<GoogleIdTokenPayload> {
  const clientId = process.env.GOOGLE_OAUTH_WEB_CLIENT_ID;
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
