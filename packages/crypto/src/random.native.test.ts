import sodium from 'react-native-libsodium';
import { describe, expect, it } from 'vitest';
// Explicit filename — vitest/Node has no Metro-style platform-extension
// resolution, so this is the only way to exercise this file from a host
// test. Confirmed directly (not assumed): unlike kdf.native.ts's
// `deriveKeyFromPassword` (whose native Argon2id path genuinely cannot run
// under Node), `react-native-libsodium`'s `randombytes_buf` is backed on
// the host by the package's own WASM fallback build (`libsodium-wrappers`,
// loaded once `sodium.ready` resolves) — a real CSPRNG, not a stub, so
// these tests exercise real random-byte generation, not just this file's
// wrapping logic. What is NOT exercised here is the actual on-device JSI
// binding (`global.jsi_randombytes_buf`) real native builds use instead —
// that requires a real React Native runtime; see PROGRESS.md for the
// on-device verification this ticket separately performed.
import { generateAesKey, generateIv, generateRecoveryCodeBytes, generateSalt } from './random.native';
import {
  generateAesKey as generateAesKeyWeb,
  generateIv as generateIvWeb,
  generateRecoveryCodeBytes as generateRecoveryCodeBytesWeb,
  generateSalt as generateSaltWeb,
} from './random';

// The WASM fallback build's own module load — awaited once here so every
// test below calls the already-primed synchronous export, matching how it
// behaves on a real device (where `ready` is a no-op resolved promise,
// per this package's own `src/lib.native.ts`, since JSI bindings are
// installed before any JS runs — there is nothing to await for real).
await sodium.ready;

describe('random.native.ts (React Native CSPRNG path, react-native-libsodium-backed)', () => {
  describe('byte lengths — parity with random.ts', () => {
    it.each([
      ['generateAesKey', generateAesKey, generateAesKeyWeb, 32],
      ['generateIv', generateIv, generateIvWeb, 12],
      ['generateSalt', generateSalt, generateSaltWeb, 16],
      ['generateRecoveryCodeBytes', generateRecoveryCodeBytes, generateRecoveryCodeBytesWeb, 16],
    ] as const)('%s returns the requested byte length, matching random.ts', (_name, native, web, expectedLength) => {
      expect(native().length).toBe(expectedLength);
      expect(native().length).toBe(web().length);
    });
  });

  describe('shape', () => {
    it.each([
      ['generateAesKey', generateAesKey],
      ['generateIv', generateIv],
      ['generateSalt', generateSalt],
      ['generateRecoveryCodeBytes', generateRecoveryCodeBytes],
    ] as const)('%s returns a real Uint8Array', (_name, fn) => {
      const result = fn();
      expect(result).toBeInstanceOf(Uint8Array);
      expect(ArrayBuffer.isView(result)).toBe(true);
    });
  });

  describe('independence', () => {
    it.each([
      ['generateAesKey', generateAesKey],
      ['generateIv', generateIv],
      ['generateSalt', generateSalt],
      ['generateRecoveryCodeBytes', generateRecoveryCodeBytes],
    ] as const)('%s produces different output on successive calls', (_name, fn) => {
      const a = fn();
      const b = fn();
      expect(a).not.toEqual(b);
    });

    it('generateAesKey never returns an all-zero key across many calls (a stuck/broken CSPRNG would)', () => {
      for (let i = 0; i < 20; i++) {
        const key = generateAesKey();
        expect(key.some((byte) => byte !== 0)).toBe(true);
      }
    });

    it('produces no collisions across a reasonably large sample of keys', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        seen.add(Buffer.from(generateAesKey()).toString('hex'));
      }
      expect(seen.size).toBe(200);
    });
  });

  describe('parity with random.ts beyond byte length', () => {
    it('generateIv is the correct length for AES-GCM (96 bits, matching random.ts and aes.ts/aes.native.ts)', () => {
      expect(generateIv().length).toBe(12);
    });

    it('every export random.ts has is also exported here, with the same arity', () => {
      expect(generateAesKey.length).toBe(generateAesKeyWeb.length);
      expect(generateIv.length).toBe(generateIvWeb.length);
      expect(generateSalt.length).toBe(generateSaltWeb.length);
      expect(generateRecoveryCodeBytes.length).toBe(generateRecoveryCodeBytesWeb.length);
    });
  });
});
