import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived proof that a recipient satisfied one specific non-time Seal
 * (Place or Identity) — issued by `/r/:token/verify` or `/r/:token/place-check`,
 * required (alongside the recipient access token) before the main content
 * fetch releases anything. Deliberately NOT a persistent DB row: these are
 * cheap to reissue and only need to outlive one reveal session.
 *
 * HMAC-signed rather than a JWT — this is an internal, server-only token
 * (never shown to or parsed by any client beyond echoing it back verbatim),
 * so a lightweight signed blob is enough. Same test-mode-ephemeral-secret
 * pattern as modules/auth/keys.ts's JWT keypair: real deployments must set
 * GATE_TOKEN_SECRET; NODE_ENV=test generates one in memory so tests don't
 * need a .env.
 */
const GATE_TOKEN_TTL_MS = 60 * 60 * 1000;

let cachedSecret: string | undefined;

function hmacSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.GATE_TOKEN_SECRET;
  if (fromEnv) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'test') {
    cachedSecret = randomBytes(32).toString('base64url');
    return cachedSecret;
  }

  throw new Error('GATE_TOKEN_SECRET is not set');
}

export type GateSealType = 'place' | 'identity';

export function issueGateToken(recipientId: string, sealType: GateSealType): string {
  const expiresAt = Date.now() + GATE_TOKEN_TTL_MS;
  const payload = `${recipientId}:${sealType}:${expiresAt}`;
  const signature = createHmac('sha256', hmacSecret()).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

export function verifyGateToken(token: string, recipientId: string, sealType: GateSealType): boolean {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return false;

  const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const expectedSignature = createHmac('sha256', hmacSecret()).update(payload).digest('base64url');
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  const [tokenRecipientId, tokenSealType, expiresAtStr] = payload.split(':');
  if (tokenRecipientId !== recipientId || tokenSealType !== sealType) return false;

  const expiresAt = Number(expiresAtStr);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
