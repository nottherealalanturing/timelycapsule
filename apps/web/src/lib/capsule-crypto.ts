/** Matches @tc/crypto's AES_IV_BYTES (not exported from the package's public surface). */
export const IV_BYTES = 12;

/**
 * Shared "iv||ciphertext concatenated, then base64'd once" wire format used
 * for both a capsule's `contentDocEnc` and each media item's encrypted blob
 * (`use-capsule-draft.ts`'s `encryptForCapsule`) — mirrors `@tc/crypto`'s own
 * `wrapKey` layout rather than a delimited string (see T-11 decisions log
 * for the bug this fixed: a delimited format isn't valid base64, and the
 * server decodes this value with `Buffer.from(x, 'base64')` with no
 * awareness of any internal structure).
 */
export function encodeIvCiphertext(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...combined));
}

export function decodeIvCiphertext(b64: string): { iv: Uint8Array; ciphertext: Uint8Array } {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return { iv: combined.slice(0, IV_BYTES), ciphertext: combined.slice(IV_BYTES) };
}
