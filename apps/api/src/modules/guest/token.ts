import { createHash, randomBytes } from 'node:crypto';

// Same RFC4648-base32-no-padding scheme as recipients/access-token.ts — a
// separate module (not a shared import) since the two token types live in
// different tables/domains and nothing is gained by coupling them.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOKEN_LENGTH = 26;

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

/** A fresh 26-char (~130-bit) guest session token — returned once at `POST /guest/sessions`, persisted client-side. */
export function generateGuestToken(): string {
  return encodeBase32(randomBytes(17)).slice(0, TOKEN_LENGTH);
}

export function hashGuestToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
