import { decryptBytes, encryptBytes } from './aes';
import { fromBase64Url, toBase64Url, concatBytes } from './encoding';
import { AES_IV_BYTES, SALT_BYTES } from './constants';

/**
 * A wrapped (encrypted) key, serialized as one opaque base64url string for
 * storage — matches `owner_key_wrap bytea` / equivalent columns
 * (plan/03-ARCHITECTURE.md §13). Layout: `salt(16) || iv(12) || ciphertext`.
 * `salt` is only meaningful for password/passphrase/recovery-code wraps
 * (KDF input); direct key-to-key wraps use an all-zero salt placeholder so
 * the format stays uniform.
 */
export async function wrapKey(keyToWrap: Uint8Array, wrappingKey: Uint8Array, salt: Uint8Array): Promise<string> {
  const { iv, ciphertext } = await encryptBytes(wrappingKey, keyToWrap);
  return toBase64Url(concatBytes(salt, iv, ciphertext));
}

export async function unwrapKey(blob: string, wrappingKey: Uint8Array): Promise<Uint8Array> {
  const bytes = fromBase64Url(blob);
  const salt = bytes.slice(0, SALT_BYTES);
  const iv = bytes.slice(SALT_BYTES, SALT_BYTES + AES_IV_BYTES);
  const ciphertext = bytes.slice(SALT_BYTES + AES_IV_BYTES);
  void salt; // caller already has/derives the salt when it matters (see master-key.ts)
  return decryptBytes(wrappingKey, iv, ciphertext);
}

export function extractSalt(blob: string): Uint8Array {
  return fromBase64Url(blob).slice(0, SALT_BYTES);
}
