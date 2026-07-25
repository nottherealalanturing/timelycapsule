/**
 * Zero-access encryption model (plan/06-FEATURE-ADDENDUM.md §A,
 * plan/03-ARCHITECTURE.md §8). Every constant here is a deliberate choice —
 * see README.md's threat notes before changing any of them.
 */

export const AES_KEY_BYTES = 32; // 256-bit
export const AES_IV_BYTES = 12; // 96-bit, standard for AES-GCM
export const AES_TAG_BITS = 128;

/** Chunk size for streaming file encryption — bounds memory regardless of file size. */
export const STREAM_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * Argon2id params for password/passphrase-derived wrapping keys. Tuned for
 * an interactive client-side unlock (~0.5-1s on typical hardware in 2026),
 * not server-side hashing (see apps/api's separate, independently-tuned
 * Argon2id use for login password hashing — different threat model, same
 * primitive, not the same params or code path).
 */
export const ARGON2ID_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536, // 64 MiB
  hashLength: AES_KEY_BYTES,
} as const;

export const SALT_BYTES = 16;

/** Recovery codes are already ~130 bits of entropy — HKDF, not Argon2id, is the correct primitive (see README.md). */
export const RECOVERY_CODE_BYTES = 16;
