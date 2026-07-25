import { decodeBase32, encodeBase32 } from './base32.js';
import { deriveKeyFromRecoveryCode } from './kdf.js';
import { generateRecoveryCodeBytes, generateSalt } from './random.js';
import { extractSalt, unwrapKey, wrapKey } from './wrap.js';

/**
 * Recovery kit (plan/06-FEATURE-ADDENDUM.md §A): a printable code that
 * re-derives the master key without the password. "Lose password + kit =
 * unrecoverable by anyone, including us" is the honest, intended behavior —
 * there is no server-side escape hatch.
 */
export function generateRecoveryCode(): Uint8Array {
  return generateRecoveryCodeBytes();
}

/** Human-typeable form: dash-grouped Crockford base32, e.g. `ABCDE-FGH23-...`. */
export function formatRecoveryCode(code: Uint8Array): string {
  const raw = encodeBase32(code);
  return raw.match(/.{1,5}/g)?.join('-') ?? raw;
}

export function parseRecoveryCode(formatted: string): Uint8Array {
  return decodeBase32(formatted);
}

export async function wrapMasterKeyWithRecoveryCode(masterKey: Uint8Array, recoveryCode: Uint8Array): Promise<string> {
  const salt = generateSalt();
  const wrappingKey = await deriveKeyFromRecoveryCode(recoveryCode, salt);
  return wrapKey(masterKey, wrappingKey, salt);
}

export async function restoreMasterKeyFromRecoveryCode(wrapped: string, recoveryCode: Uint8Array): Promise<Uint8Array> {
  const salt = extractSalt(wrapped);
  const wrappingKey = await deriveKeyFromRecoveryCode(recoveryCode, salt);
  return unwrapKey(wrapped, wrappingKey);
}
