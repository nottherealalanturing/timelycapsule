import { generateKeyPairSync } from 'node:crypto';
import { importPKCS8, importSPKI, type CryptoKey } from 'jose';

/**
 * RS256 signing keypair for access tokens. Real deployments must set
 * JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64 (see .env.example and
 * scripts/generate-jwt-keys.mjs) — an ephemeral in-memory keypair is only
 * generated automatically under NODE_ENV=test, so tests don't need a .env.
 */
let cached: { privateKey: CryptoKey; publicKey: CryptoKey } | undefined;

async function loadKeys(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
  const privB64 = process.env.JWT_PRIVATE_KEY_B64;
  const pubB64 = process.env.JWT_PUBLIC_KEY_B64;

  if (privB64 && pubB64) {
    const privateKey = await importPKCS8(Buffer.from(privB64, 'base64').toString('utf8'), 'RS256');
    const publicKey = await importSPKI(Buffer.from(pubB64, 'base64').toString('utf8'), 'RS256');
    return { privateKey, publicKey };
  }

  if (process.env.NODE_ENV === 'test') {
    const { privateKey: priv, publicKey: pub } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' as const },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' as const },
    });
    const privateKey = await importPKCS8(priv, 'RS256');
    const publicKey = await importSPKI(pub, 'RS256');
    return { privateKey, publicKey };
  }

  throw new Error(
    'JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64 are not set. Run: node scripts/generate-jwt-keys.mjs',
  );
}

export async function getJwtKeys(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
  if (!cached) {
    cached = await loadKeys();
  }
  return cached;
}
