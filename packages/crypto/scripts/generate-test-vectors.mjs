// Regenerates test-vectors/v1.json. Run: node scripts/generate-test-vectors.mjs
// Only re-run this if you deliberately change the AES-GCM framing/params —
// the whole point of a test-vectors file is that it does NOT silently
// change on every run (that's what makes it useful for cross-platform
// interop testing, per plan/05-BUILD-PLAYBOOK.md T-07b).
import { writeFileSync } from 'node:fs';
import { encryptBytes } from '../src/aes.js';
import { toBase64Url } from '../src/encoding.js';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const vectors = [
  {
    name: 'short-ascii-no-aad',
    keyHex: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    ivHex: '000000000000000000000000',
    aad: null,
    plaintext: 'TimelyCapsule test vector #1',
  },
  {
    name: 'short-ascii-with-aad',
    keyHex: '101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f',
    ivHex: '0102030405060708090a0b0c',
    aad: 'chunk-index-0',
    plaintext: 'TimelyCapsule test vector #2, now with associated data',
  },
  {
    name: 'empty-plaintext',
    keyHex: 'fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0',
    ivHex: 'aabbccddeeff001122334455',
    aad: null,
    plaintext: '',
  },
];

const enc = new TextEncoder();
const output = [];

for (const v of vectors) {
  const key = hexToBytes(v.keyHex);
  const iv = hexToBytes(v.ivHex);
  const aad = v.aad ? enc.encode(v.aad) : undefined;
  const plaintext = enc.encode(v.plaintext);
  const { ciphertext } = await encryptBytes(key, plaintext, aad, iv);

  output.push({
    name: v.name,
    keyB64: toBase64Url(key),
    ivB64: toBase64Url(iv),
    aad: v.aad,
    plaintext: v.plaintext,
    ciphertextB64: toBase64Url(ciphertext),
  });
}

writeFileSync(
  new URL('../test-vectors/v1.json', import.meta.url),
  JSON.stringify({ algorithm: 'AES-256-GCM', tagLengthBits: 128, vectors: output }, null, 2) + '\n',
);
console.log(`Wrote ${output.length} vectors to test-vectors/v1.json`);
