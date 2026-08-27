import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// Explicit filename — vitest/Node has no Metro-style platform-extension
// resolution, so this is the only way to exercise the React Native AES
// path from a host test. `@noble/ciphers` (unlike react-native-libsodium)
// is pure JS with no native/JSI dependency, so — unlike kdf.native.ts —
// this file's actual behavior *can* be verified here, not just on-device.
import { decryptBytes, encryptBytes } from './aes.native';
import { fromBase64Url } from './encoding';

const vectorsPath = fileURLToPath(new URL('../test-vectors/v1.json', import.meta.url));
const { vectors } = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
  vectors: Array<{ name: string; keyB64: string; ivB64: string; aad: string | null; plaintext: string; ciphertextB64: string }>;
};

describe('aes.native.ts (React Native AES-GCM path) against test-vectors/v1.json', () => {
  it.each(vectors)('$name: encrypts to the same recorded ciphertext as the WebCrypto path', async (v) => {
    const key = fromBase64Url(v.keyB64);
    const iv = fromBase64Url(v.ivB64);
    const aad = v.aad ? new TextEncoder().encode(v.aad) : undefined;
    const plaintext = new TextEncoder().encode(v.plaintext);

    const { ciphertext } = await encryptBytes(key, plaintext, aad, iv);
    expect(fromBase64Url(v.ciphertextB64)).toEqual(ciphertext);
  });

  it.each(vectors)('$name: decrypts back to the same recorded plaintext as the WebCrypto path', async (v) => {
    const key = fromBase64Url(v.keyB64);
    const iv = fromBase64Url(v.ivB64);
    const aad = v.aad ? new TextEncoder().encode(v.aad) : undefined;
    const ciphertext = fromBase64Url(v.ciphertextB64);

    const decrypted = await decryptBytes(key, iv, ciphertext, aad);
    expect(new TextDecoder().decode(decrypted)).toBe(v.plaintext);
  });

  it('rejects a tampered ciphertext (wrong auth tag) instead of returning wrong plaintext', async () => {
    const key = fromBase64Url(vectors[0]!.keyB64);
    const iv = fromBase64Url(vectors[0]!.ivB64);
    const ciphertext = fromBase64Url(vectors[0]!.ciphertextB64);
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    await expect(decryptBytes(key, iv, ciphertext)).rejects.toThrow();
  });
});
