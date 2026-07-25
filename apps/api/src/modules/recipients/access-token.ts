import { createHash, randomBytes } from 'node:crypto';

// RFC4648 base32 (no padding) — recipient access tokens are pasted into
// links, so unlike public_id (T-08) there's no need for an unambiguous
// alphabet; this just needs to be URL-safe and compact.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOKEN_LENGTH = 26; // 26 base32 chars ≈ 130 bits (plan/03-ARCHITECTURE.md §17)

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/** A fresh 26-char (~130-bit) recipient access token — the raw value the sender's link carries in `/r/:token`. */
export function generateAccessToken(): string {
  // 17 bytes = 136 bits, comfortably covers the 130 bits of the truncated
  // 26-char output below without ever running short on entropy.
  return encodeBase32(randomBytes(17)).slice(0, TOKEN_LENGTH);
}

/** Only the hash is ever persisted (plan/03-ARCHITECTURE.md §8: "Access links... stored hashed (SHA-256)"). */
export function hashAccessToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
