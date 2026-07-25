import { generateAesKey, generateSalt } from './random.js';
import { deriveKeyFromPassword } from './kdf.js';
import { extractSalt, unwrapKey, wrapKey } from './wrap.js';

/**
 * The owner master key: generated once at signup, never rotated (only
 * re-wrapped) — plan/06-FEATURE-ADDENDUM.md §A. Every capsule's content key
 * gets wrapped under this so the owner can decrypt their own capsules from
 * any device after unlocking the master key with their password.
 */
export function generateMasterKey(): Uint8Array {
  return generateAesKey();
}

export async function wrapMasterKeyWithPassword(masterKey: Uint8Array, password: string): Promise<string> {
  const salt = generateSalt();
  const wrappingKey = await deriveKeyFromPassword(password, salt);
  return wrapKey(masterKey, wrappingKey, salt);
}

/** Throws if the password is wrong (AES-GCM auth tag fails) — never returns a wrong key silently. */
export async function unwrapMasterKeyWithPassword(wrapped: string, password: string): Promise<Uint8Array> {
  const salt = extractSalt(wrapped);
  const wrappingKey = await deriveKeyFromPassword(password, salt);
  return unwrapKey(wrapped, wrappingKey);
}

/** Password change: re-wrap the *same* master key under a fresh salt + the new password. Capsule key wraps are untouched. */
export async function rewrapMasterKeyWithNewPassword(masterKey: Uint8Array, newPassword: string): Promise<string> {
  return wrapMasterKeyWithPassword(masterKey, newPassword);
}
