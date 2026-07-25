import { bs } from './buffer-source.js';
import { AES_TAG_BITS, STREAM_CHUNK_BYTES } from './constants.js';
import { concatBytes } from './encoding.js';
import { generateIv } from './random.js';

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
    { name: 'AES-GCM', iv: bs(iv), additionalData: aad && bs(aad), tagLength: AES_TAG_BITS },
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
    { name: 'AES-GCM', iv: bs(iv), additionalData: aad && bs(aad), tagLength: AES_TAG_BITS },
    cryptoKey,
    bs(ciphertext),
  );
  return new Uint8Array(buffer);
}

function deriveChunkIv(baseIv: Uint8Array, index: number): Uint8Array {
  // Per-chunk IV: XOR the base IV's last 4 bytes with the big-endian chunk
  // index. Unique per chunk for a given baseIv without transmitting an IV
  // per chunk — only the 12-byte baseIv needs to travel with the stream.
  const iv = baseIv.slice();
  const view = new DataView(iv.buffer, iv.byteOffset + iv.length - 4, 4);
  const counter = view.getUint32(0) ^ index;
  view.setUint32(0, counter >>> 0);
  return iv;
}

/**
 * AAD binds each chunk to its position (index) *and* whether it's the last
 * chunk in the stream. The `isFinal` bit is what lets `decryptStream` detect
 * truncation: a chunk encrypted mid-stream (`isFinal=false`) will fail
 * authentication if a truncated transport makes it *look* like the last
 * chunk on the way in (see `decryptStream`'s lookahead below) — the GCM tag
 * simply won't verify against the wrong AAD.
 */
function chunkAad(index: number, isFinal: boolean): Uint8Array {
  const aad = new Uint8Array(5);
  new DataView(aad.buffer).setUint32(0, index);
  aad[4] = isFinal ? 1 : 0;
  return aad;
}

function toAsyncIterator<T>(source: AsyncIterable<T> | Iterable<T>): AsyncIterator<T> {
  const asyncIterable = source as AsyncIterable<T>;
  if (typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    return asyncIterable[Symbol.asyncIterator]();
  }
  return (async function* () {
    yield* source as Iterable<T>;
  })();
}

async function* bufferToChunks(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  chunkSize: number,
): AsyncGenerator<Uint8Array> {
  let buffer: Uint8Array = new Uint8Array(0);
  for await (const piece of source) {
    buffer = concatBytes(buffer, piece);
    while (buffer.length >= chunkSize) {
      yield buffer.slice(0, chunkSize);
      buffer = buffer.slice(chunkSize);
    }
  }
  if (buffer.length > 0) {
    yield buffer;
  }
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
