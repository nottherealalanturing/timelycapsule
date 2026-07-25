import { argon2id } from 'hash-wasm';
import { ARGON2ID_PARAMS } from './constants.js';
import { bs } from './buffer-source.js';

/**
 * Derives a wrapping key from a low-entropy secret (password or passphrase)
 * via Argon2id — memory-hard, so brute-forcing a stolen wrapped blob is
 * expensive even though the input isn't. Never used for the recovery code
 * (see `deriveKeyFromRecoveryCode`), which is already high-entropy and
 * needs a fast KDF instead, not a slow/memory-hard one.
 */
export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    ...ARGON2ID_PARAMS,
    outputType: 'binary',
  });
}

/**
 * HKDF-SHA256 for the recovery code — already ~128 bits of random entropy
 * (see `random.ts`'s `generateRecoveryCodeBytes`), so memory-hard stretching
 * buys nothing and only slows down recovery. HKDF is the correct primitive
 * for "already-random input, need a key of a specific shape" (RFC 5869).
 */
export async function deriveKeyFromRecoveryCode(recoveryCode: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', bs(recoveryCode), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(new TextEncoder().encode('tc-recovery-kit-v1')) },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}
