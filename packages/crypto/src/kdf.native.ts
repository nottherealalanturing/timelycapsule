import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import sodium from 'react-native-libsodium';
import { ARGON2ID_PARAMS } from './constants';

/**
 * React Native replacement for kdf.ts — Hermes has no WASM runtime, so
 * hash-wasm's Argon2id (used on web) cannot run here. Metro resolves this
 * file over kdf.ts automatically when bundling for ios/android (RN's
 * platform-extension resolution); web/Node are unaffected and keep using
 * kdf.ts unchanged.
 *
 * `react-native-libsodium`'s native `crypto_pwhash` was proven, byte-for-
 * byte, against this exact production parameter set and against
 * test-vectors/argon2id-v1.json on both iOS Simulator and an Android
 * emulator during Stage E's E0.1 spike — this is that proof wired into the
 * real app, not a new, unverified integration. Physical-device timing
 * remains unverified (E0.1's own stated limitation) — see PROGRESS.md.
 *
 * Do NOT change ARGON2ID_PARAMS to make this "easier" — doing so would
 * break compatibility with every already-server-stored masterKeyWrap.
 */
export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  await sodium.ready;
  // libsodium's crypto_pwhash expresses memory in bytes; the shared
  // ARGON2ID_PARAMS.memorySize is KiB (hash-wasm's own unit) — this is the
  // one required conversion E0.1 identified, not a parameter change.
  const memLimitBytes = ARGON2ID_PARAMS.memorySize * 1024;
  return sodium.crypto_pwhash(
    ARGON2ID_PARAMS.hashLength,
    password,
    salt,
    ARGON2ID_PARAMS.iterations,
    memLimitBytes,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

/**
 * Identical algorithm and output to kdf.ts's WebCrypto-based version
 * (HKDF-SHA256, same salt/info) — confirmed byte-for-byte against it
 * before this file was written, not assumed. Duplicated rather than
 * shared only because kdf.ts's version is tied to `crypto.subtle`, which
 * doesn't exist here; `@noble/hashes` is the platform-agnostic equivalent
 * for this one function, small enough that a shared third file would be
 * more indirection than the ~10 lines it saves.
 */
export async function deriveKeyFromRecoveryCode(recoveryCode: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const info = new TextEncoder().encode('tc-recovery-kit-v1');
  return hkdf(sha256, recoveryCode, salt, info, 32);
}
