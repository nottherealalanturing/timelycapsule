import { bufferToChunks, chunkAad, deriveChunkIv, toAsyncIterator } from './aes-chunking';
import { bs } from './buffer-source';
import { AES_TAG_BITS, STREAM_CHUNK_BYTES } from './constants';
import { generateIv } from './random';

async function importAesKey(rawKey: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bs(rawKey), { name: 'AES-GCM' }, false, usages);
}

export interface Encrypted {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * Single-shot AES-256-GCM — for small payloads (the capsule content doc,
 * wrapped keys). Not for large files; see `encryptStream`. `iv` is normally
 * omitted (a fresh random one is generated); it's exposed only so the
 * published test vectors (test-vectors/v1.json) can be deterministic.
 */
export async function encryptBytes(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
  iv: Uint8Array = generateIv(),
): Promise<Encrypted> {
  const cryptoKey = await importAesKey(key, ['encrypt']);
  const buffer = await crypto.subtle.encrypt(
    // additionalData must be omitted entirely when there's no AAD — Node's
    // WebCrypto tolerates `additionalData: undefined`, but real browsers
    // (spec-strict WebIDL) reject it with "Not a BufferSource" since the
    // key is present even though its value is undefined.
    aad
      ? { name: 'AES-GCM', iv: bs(iv), additionalData: bs(aad), tagLength: AES_TAG_BITS }
      : { name: 'AES-GCM', iv: bs(iv), tagLength: AES_TAG_BITS },
    cryptoKey,
    bs(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(buffer) };
}

export async function decryptBytes(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await importAesKey(key, ['decrypt']);
  const buffer = await crypto.subtle.decrypt(
    aad
      ? { name: 'AES-GCM', iv: bs(iv), additionalData: bs(aad), tagLength: AES_TAG_BITS }
      : { name: 'AES-GCM', iv: bs(iv), tagLength: AES_TAG_BITS },
    cryptoKey,
    bs(ciphertext),
  );
  return new Uint8Array(buffer);
}

/**
 * Chunked AES-256-GCM for large files (plan/05-BUILD-PLAYBOOK.md T-07b:
 * "chunked for large video"). Bounds memory to ~`chunkSize` regardless of
 * total file size — never buffers the whole file. Each chunk gets its own
 * derived IV and is AAD-bound to its index *and* to whether it's the last
 * chunk (see `chunkAad`) — this is what lets `decryptStream` detect a
 * truncated stream, not just reordered/swapped chunks within one. This is a
 * framed sequence of discrete ciphertext units, not a raw byte pipe.
 *
 * The first yielded frame is the raw 12-byte base IV; every frame after
 * that is one encrypted chunk. `decryptStream` expects exactly this shape.
 */
export async function* encryptStream(
  key: Uint8Array,
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  chunkSize: number = STREAM_CHUNK_BYTES,
): AsyncGenerator<Uint8Array> {
  const baseIv = generateIv();
  yield baseIv;

  const cryptoKey = await importAesKey(key, ['encrypt']);
  const iterator = bufferToChunks(source, chunkSize)[Symbol.asyncIterator]();
  let index = 0;
  // One-chunk lookahead: we only know a chunk is the *last* one once the
  // next `next()` call comes back done, since the source is a lazy
  // (possibly infinite-looking) async iterable, not a known-length array.
  let current = await iterator.next();
  while (!current.done) {
    const lookahead = await iterator.next();
    const isFinal = lookahead.done === true;
    const iv = deriveChunkIv(baseIv, index);
    const buffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: bs(iv), additionalData: bs(chunkAad(index, isFinal)), tagLength: AES_TAG_BITS },
      cryptoKey,
      bs(current.value),
    );
    yield new Uint8Array(buffer);
    index += 1;
    current = lookahead;
  }
}

export async function* decryptStream(
  key: Uint8Array,
  frames: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const cryptoKey = await importAesKey(key, ['decrypt']);
  const iterator = toAsyncIterator(frames);

  const baseIvResult = await iterator.next();
  if (baseIvResult.done) return;
  const baseIv = baseIvResult.value;

  let index = 0;
  // Same one-frame lookahead as encryptStream: if the underlying transport
  // truncated the stream, whatever frame we *think* is last (because no
  // more arrived) was actually encrypted with isFinal=false, so its AAD
  // won't match here and decryption throws — truncation surfaces as an
  // authentication failure instead of silently short plaintext.
  let current = await iterator.next();
  while (!current.done) {
    const lookahead = await iterator.next();
    const isFinal = lookahead.done === true;
    const iv = deriveChunkIv(baseIv, index);
    const buffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bs(iv), additionalData: bs(chunkAad(index, isFinal)), tagLength: AES_TAG_BITS },
      cryptoKey,
      bs(current.value),
    );
    yield new Uint8Array(buffer);
    index += 1;
    current = lookahead;
  }
}
