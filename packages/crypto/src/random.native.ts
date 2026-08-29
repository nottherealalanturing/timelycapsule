import sodium from 'react-native-libsodium';
import { AES_IV_BYTES, AES_KEY_BYTES, RECOVERY_CODE_BYTES, SALT_BYTES } from './constants';

/**
 * React Native replacement for random.ts — Hermes has no WebCrypto
 * (`crypto.getRandomValues` doesn't exist), so random.ts's implementation
 * cannot run here. Metro resolves this file over random.ts automatically
 * when bundling for ios/android (RN's platform-extension resolution),
 * exactly like kdf.native.ts/aes.native.ts; web/Node are unaffected and
 * keep using random.ts unchanged.
 *
 * `react-native-libsodium`'s `randombytes_buf` calls libsodium's own
 * `randombytes_buf` directly over JSI (`global.jsi_randombytes_buf` in
 * this package's `lib.native.ts`) — the same battle-tested CSPRNG this
 * package already trusts for every other native primitive
 * (`kdf.native.ts`'s `crypto_pwhash`), seeded from the OS's own secure
 * random source (`/dev/urandom` on Android, `SecRandomCopyBytes` on iOS —
 * libsodium's own platform layer, not anything this package implements).
 * This is a synchronous native call, not WASM: unlike the web build's
 * `sodium.ready` (which awaits a WASM module load), this package's own
 * native `ready` is a no-op resolved promise (its JSI bindings are
 * installed as part of native module registration, before any JS runs) —
 * see this package's own `src/lib.native.ts`. That is what lets every
 * function below stay fully synchronous, matching random.ts's exact
 * signatures: `aes.ts`/`aes.native.ts` both call `generateIv()` as a
 * default-parameter expression (`iv: Uint8Array = generateIv()`), which is
 * only legal for a synchronous function — an async version would silently
 * break that call site's type.
 *
 * If the native module is somehow unavailable (a bridging/build problem,
 * not a normal runtime condition), `sodium.randombytes_buf` throws rather
 * than this file catching that and falling back to anything weaker — there
 * is no acceptable insecure fallback for key/IV/salt material.
 */
function randomBytes(length: number): Uint8Array {
  return sodium.randombytes_buf(length);
}

export function generateAesKey(): Uint8Array {
  return randomBytes(AES_KEY_BYTES);
}

export function generateIv(): Uint8Array {
  return randomBytes(AES_IV_BYTES);
}

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

export function generateRecoveryCodeBytes(): Uint8Array {
  return randomBytes(RECOVERY_CODE_BYTES);
}
