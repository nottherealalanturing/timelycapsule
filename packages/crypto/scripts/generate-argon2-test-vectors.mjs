// Regenerates test-vectors/argon2id-v1.json. Run: node scripts/generate-argon2-test-vectors.mjs
// Deterministic (password, salt, params) -> expected master/wrapping-key vectors,
// generated from the *production* deriveKeyFromPassword path (hash-wasm's argon2id,
// packages/crypto/src/kdf.ts + constants.ts's ARGON2ID_PARAMS). This is the
// cross-platform interop fixture: any candidate implementation (native RN module,
// a future WebCrypto polyfill, etc) must reproduce expectedKeyB64 byte-for-byte for
// every vector, given the same password/salt/params. Do not hand-edit this file —
// regenerate it, and only when constants.ts's ARGON2ID_PARAMS deliberately changes
// (which breaks compatibility with every already-wrapped master key — see
// packages/crypto/README.md's threat notes before doing that).
import { writeFileSync } from 'node:fs';
import { argon2id } from 'hash-wasm';
import { ARGON2ID_PARAMS } from '../src/constants.ts';
import { toBase64Url } from '../src/encoding.ts';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Salts are fixed, non-random hex so the file is reproducible on regeneration.
// Password coverage: short ASCII, long (>200 char), non-ASCII/multi-script/emoji
// (validates UTF-8 encoding, no NFC/NFKD normalization), single character (the
// minimum hash-wasm accepts), and leading/trailing whitespace + symbols (validates
// no trimming/normalization happens anywhere in the pipeline).
const vectors = [
  {
    name: 'short-ascii-password',
    password: 'correct-horse',
    saltHex: '000102030405060708090a0b0c0d0e0f',
  },
  {
    name: 'long-password',
    password: 'a'.repeat(200) + '-the-quick-brown-fox-jumps-over-the-lazy-dog-1234567890',
    saltHex: '101112131415161718191a1b1c1d1e1f',
  },
  {
    name: 'non-ascii-password',
    password: 'correct-horse-🔒-Straße-日本語-Ω',
    saltHex: '202122232425262728292a2b2c2d2e2f',
  },
  {
    name: 'single-char-password',
    password: 'x',
    saltHex: '303132333435363738393a3b3c3d3e3f',
  },
  {
    name: 'whitespace-and-symbols-password',
    password: '  correct horse! @#$%^&*()  \t\n',
    saltHex: '404142434445464748494a4b4c4d4e4f',
  },
];

const output = [];
for (const v of vectors) {
  const salt = hexToBytes(v.saltHex);
  const key = await argon2id({
    password: v.password,
    salt,
    ...ARGON2ID_PARAMS,
    outputType: 'binary',
  });
  output.push({
    name: v.name,
    password: v.password,
    saltB64: toBase64Url(salt),
    expectedKeyB64: toBase64Url(key),
  });
}

writeFileSync(
  new URL('../test-vectors/argon2id-v1.json', import.meta.url),
  JSON.stringify(
    {
      algorithm: 'Argon2id',
      version: 19,
      params: ARGON2ID_PARAMS,
      note: 'expectedKeyB64 generated from the production deriveKeyFromPassword path (hash-wasm). Any RN/native implementation must reproduce these byte-for-byte given the same password/salt/params.',
      vectors: output,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${output.length} vectors to test-vectors/argon2id-v1.json`);
