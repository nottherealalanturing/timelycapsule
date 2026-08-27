import { concatBytes } from './encoding';

/**
 * Platform-agnostic chunked-stream helpers shared by `aes.ts` (WebCrypto,
 * web/Node) and `aes.native.ts` (React Native — see that file's own header
 * for why WebCrypto isn't available there). None of this touches a crypto
 * primitive; only the AEAD calls themselves differ between the two files,
 * so this is the one place chunk framing/IV-derivation logic lives,
 * rather than being copied twice and risking drift.
 */

/** Per-chunk IV: XOR the base IV's last 4 bytes with the big-endian chunk index — unique per chunk without transmitting an IV per chunk. */
export function deriveChunkIv(baseIv: Uint8Array, index: number): Uint8Array {
  const iv = baseIv.slice();
  const view = new DataView(iv.buffer, iv.byteOffset + iv.length - 4, 4);
  const counter = view.getUint32(0) ^ index;
  view.setUint32(0, counter >>> 0);
  return iv;
}

/**
 * AAD binds each chunk to its position (index) *and* whether it's the last
 * chunk in the stream — see `aes.ts`'s original comment for the truncation-
 * detection rationale this exists for.
 */
export function chunkAad(index: number, isFinal: boolean): Uint8Array {
  const aad = new Uint8Array(5);
  new DataView(aad.buffer).setUint32(0, index);
  aad[4] = isFinal ? 1 : 0;
  return aad;
}

export function toAsyncIterator<T>(source: AsyncIterable<T> | Iterable<T>): AsyncIterator<T> {
  const asyncIterable = source as AsyncIterable<T>;
  if (typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    return asyncIterable[Symbol.asyncIterator]();
  }
  return (async function* () {
    yield* source as Iterable<T>;
  })();
}

export async function* bufferToChunks(
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
