import { describe, expect, it } from 'vitest';
import { deriveKeyFromRecoveryCode as deriveKeyFromRecoveryCodeNative } from './kdf.native';
import { deriveKeyFromRecoveryCode } from './kdf';
import { generateRecoveryCodeBytes, generateSalt } from './random';

/**
 * `deriveKeyFromRecoveryCode` in kdf.native.ts uses `@noble/hashes`, not
 * `react-native-libsodium` — unlike `deriveKeyFromPassword` in the same
 * file, it has no native/JSI dependency, so (like aes.native.test.ts) it
 * can be verified directly on the host, not only on-device.
 * `deriveKeyFromPassword`'s native Argon2id path cannot be exercised here —
 * `react-native-libsodium` requires a real React Native/JSI runtime and
 * does not expose `crypto_pwhash` under plain Node (confirmed directly,
 * not assumed) — see the E1.2 report for the on-device vector evidence.
 */
describe('kdf.native.ts deriveKeyFromRecoveryCode (HKDF, no native module needed)', () => {
  it('matches the WebCrypto-based kdf.ts implementation byte-for-byte for the same input', async () => {
    const code = generateRecoveryCodeBytes();
    const salt = generateSalt();
    const webResult = await deriveKeyFromRecoveryCode(code, salt);
    const nativeResult = await deriveKeyFromRecoveryCodeNative(code, salt);
    expect(nativeResult).toEqual(webResult);
  });

  it('is deterministic for the same code+salt', async () => {
    const code = generateRecoveryCodeBytes();
    const salt = generateSalt();
    const a = await deriveKeyFromRecoveryCodeNative(code, salt);
    const b = await deriveKeyFromRecoveryCodeNative(code, salt);
    expect(a).toEqual(b);
  });
});
