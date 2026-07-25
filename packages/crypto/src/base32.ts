// Crockford base32 (https://www.crockford.com/base32.html) — excludes
// I/L/O/U to avoid transcription errors when a human types a printed
// recovery code back in. Not used for anything machine-to-machine.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function encodeBase32(bytes: Uint8Array): string {
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

export function decodeBase32(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}
