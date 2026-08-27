import { gcm } from '@noble/ciphers/aes.js';
import { bufferToChunks, chunkAad, deriveChunkIv, toAsyncIterator } from './aes-chunking';
import { STREAM_CHUNK_BYTES } from './constants';
import { generateIv } from './random';

/**
 * React Native has no WebCrypto (`crypto.subtle`) — Hermes doesn't
 * implement it, and this monorepo deliberately avoids pulling in a full
 * WebCrypto-polyfill native module stack (react-native-quick-crypto +
 * Nitro Modules + its own peer deps) just for AES-256-GCM on small
 * payloads. `@noble/ciphers` is a pure-JS, zero-dependency, audited
 * implementation of the exact same standard AES-256-GCM construction —
 * confirmed byte-for-byte identical to this package's WebCrypto-based
 * `aes.ts` against the existing published vectors
 * (test-vectors/v1.json) before this file was written, not assumed.
 * Metro resolves this file over `aes.ts` automatically when bundling for
 * ios/android (RN's platform-extension resolution) — nothing needs
 * pointing at this file explicitly, exactly like `kdf.native.ts`.
 *
 * `AES_TAG_BITS` (128) matches `@noble/ciphers`' default GCM tag length,
 * so it's imported only for documentation parity with aes.ts, not passed
 * anywhere — `gcm()` has no tag-length parameter to set; it always uses the
 * standard 128-bit GCM tag, matching aes.ts's `AES_TAG_BITS`.
 */

export interface Encrypted {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

/** Single-shot AES-256-GCM — same contract as aes.ts's encryptBytes, `@noble/ciphers`-backed. */
export async function encryptBytes(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
  iv: Uint8Array = generateIv(),
): Promise<Encrypted> {
  const cipher = gcm(key, iv, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return { iv, ciphertext };
}

export async function decryptBytes(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const cipher = gcm(key, iv, aad);
  // `@noble/ciphers` throws a generic Error on auth-tag mismatch, same as
  // WebCrypto's decrypt rejecting — callers already only depend on "throws
  // on wrong key/tampered ciphertext", never on a specific error shape.
  return cipher.decrypt(ciphertext);
}

/** Chunked AES-256-GCM for large files — same framing as aes.ts's encryptStream (see aes-chunking.ts). */
export async function* encryptStream(
  key: Uint8Array,
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  chunkSize: number = STREAM_CHUNK_BYTES,
): AsyncGenerator<Uint8Array> {
  const baseIv = generateIv();
  yield baseIv;

  const iterator = bufferToChunks(source, chunkSize)[Symbol.asyncIterator]();
  let index = 0;
  let current = await iterator.next();
  while (!current.done) {
    const lookahead = await iterator.next();
    const isFinal = lookahead.done === true;
    const iv = deriveChunkIv(baseIv, index);
    const cipher = gcm(key, iv, chunkAad(index, isFinal));
    yield cipher.encrypt(current.value);
    index += 1;
    current = lookahead;
  }
}

export async function* decryptStream(
  key: Uint8Array,
  frames: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const iterator = toAsyncIterator(frames);

  const baseIvResult = await iterator.next();
  if (baseIvResult.done) return;
  const baseIv = baseIvResult.value;

  let index = 0;
  let current = await iterator.next();
  while (!current.done) {
    const lookahead = await iterator.next();
    const isFinal = lookahead.done === true;
    const iv = deriveChunkIv(baseIv, index);
    const cipher = gcm(key, iv, chunkAad(index, isFinal));
    yield cipher.decrypt(current.value);
    index += 1;
    current = lookahead;
  }
}
