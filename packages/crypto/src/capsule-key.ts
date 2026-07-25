import { fromBase64Url, toBase64Url } from './encoding.js';
import { deriveKeyFromPassword } from './kdf.js';
import { generateAesKey, generateSalt } from './random.js';
import { extractSalt, unwrapKey, wrapKey } from './wrap.js';

const ZERO_SALT = new Uint8Array(16); // key-to-key wraps don't need a KDF salt — see wrap.ts

/** Random 256-bit content key, generated client-side per capsule (plan/06-FEATURE-ADDENDUM.md §A). */
export function generateCapsuleKey(): Uint8Array {
  return generateAesKey();
}

/** Wrapped under the owner's master key — lets the owner reopen their own draft/sealed capsules from any device. */
export async function wrapCapsuleKeyForOwner(capsuleKey: Uint8Array, masterKey: Uint8Array): Promise<string> {
  return wrapKey(capsuleKey, masterKey, ZERO_SALT);
}

export async function unwrapCapsuleKeyForOwner(wrapped: string, masterKey: Uint8Array): Promise<Uint8Array> {
  return unwrapKey(wrapped, masterKey);
}

/** Passphrase Seal (plan/03-ARCHITECTURE.md §8 "Seals"): an extra unlock gate independent of the recipient link. */
export async function wrapCapsuleKeyWithPassphrase(capsuleKey: Uint8Array, passphrase: string): Promise<string> {
  const salt = generateSalt();
  const wrappingKey = await deriveKeyFromPassword(passphrase, salt);
  return wrapKey(capsuleKey, wrappingKey, salt);
}

export async function unwrapCapsuleKeyWithPassphrase(wrapped: string, passphrase: string): Promise<Uint8Array> {
  const salt = extractSalt(wrapped);
  const wrappingKey = await deriveKeyFromPassword(passphrase, salt);
  return unwrapKey(wrapped, wrappingKey);
}

/**
 * The recipient link fragment (`#k=…`, plan/06-FEATURE-ADDENDUM.md §A) carries
 * the raw capsule key directly — the fragment itself never reaches the
 * server (browsers don't send fragments in requests), so it *is* the secure
 * channel; wrapping the key again here would add no protection, only
 * complexity. Anyone extending this must not start sending fragment
 * contents to the server for any reason (analytics, logging, etc).
 */
export function encodeCapsuleKeyForLink(capsuleKey: Uint8Array): string {
  return `k=${toBase64Url(capsuleKey)}`;
}

export function decodeCapsuleKeyFromLink(fragment: string): Uint8Array {
  const match = /(?:^|[#&])k=([^&]+)/.exec(fragment);
  if (!match) {
    throw new Error('No capsule key found in link fragment');
  }
  return fromBase64Url(match[1]!);
}
