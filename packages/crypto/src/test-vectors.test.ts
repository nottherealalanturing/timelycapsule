import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decryptBytes, encryptBytes } from './aes';
import { fromBase64Url } from './encoding';
import { deriveKeyFromPassword } from './kdf';

/**
 * Published test vectors (plan/05-BUILD-PLAYBOOK.md T-07b: "consumed by
 * both platforms' test suites") — fixed key/iv/plaintext → expected
 * ciphertext, checked into test-vectors/v1.json. A future RN test suite
 * reads the same file to prove the two implementations produce byte-
 * identical output, not just "each is internally consistent." Regenerate
 * via scripts/generate-test-vectors.mjs — but only on a deliberate framing
 * change, since silent regeneration defeats the point of a fixed vector.
 */
const vectorsPath = fileURLToPath(new URL('../test-vectors/v1.json', import.meta.url));
const { vectors } = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
  vectors: Array<{ name: string; keyB64: string; ivB64: string; aad: string | null; plaintext: string; ciphertextB64: string }>;
};

describe('test-vectors/v1.json', () => {
  it.each(vectors)('$name: encrypts to the recorded ciphertext', async (v) => {
    const key = fromBase64Url(v.keyB64);
    const iv = fromBase64Url(v.ivB64);
    const aad = v.aad ? new TextEncoder().encode(v.aad) : undefined;
    const plaintext = new TextEncoder().encode(v.plaintext);

    const { ciphertext } = await encryptBytes(key, plaintext, aad, iv);
    expect(fromBase64Url(v.ciphertextB64)).toEqual(ciphertext);
  });

  it.each(vectors)('$name: decrypts back to the recorded plaintext', async (v) => {
    const key = fromBase64Url(v.keyB64);
    const iv = fromBase64Url(v.ivB64);
    const aad = v.aad ? new TextEncoder().encode(v.aad) : undefined;
    const ciphertext = fromBase64Url(v.ciphertextB64);

    const decrypted = await decryptBytes(key, iv, ciphertext, aad);
    expect(new TextDecoder().decode(decrypted)).toBe(v.plaintext);
  });
});

/**
 * Argon2id cross-platform interop fixture (Stage E, E0.1 spike) — same idea
 * as v1.json above, but for `deriveKeyFromPassword`. A future RN Argon2id
 * implementation (native module) must reproduce every `expectedKeyB64` here
 * byte-for-byte. Regenerate via scripts/generate-argon2-test-vectors.mjs,
 * only on a deliberate ARGON2ID_PARAMS change (see constants.ts/README.md —
 * changing params breaks every already-wrapped master key).
 */
const argon2VectorsPath = fileURLToPath(new URL('../test-vectors/argon2id-v1.json', import.meta.url));
const { vectors: argon2Vectors } = JSON.parse(readFileSync(argon2VectorsPath, 'utf8')) as {
  vectors: Array<{ name: string; password: string; saltB64: string; expectedKeyB64: string }>;
};

describe('test-vectors/argon2id-v1.json', () => {
  it.each(argon2Vectors)('$name: derives the recorded key', async (v) => {
    const salt = fromBase64Url(v.saltB64);
    const key = await deriveKeyFromPassword(v.password, salt);
    expect(fromBase64Url(v.expectedKeyB64)).toEqual(key);
  });
});
