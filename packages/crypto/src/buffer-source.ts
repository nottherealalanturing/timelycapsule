// TS's DOM lib types BufferSource as Uint8Array<ArrayBuffer> specifically
// (excluding SharedArrayBuffer-backed views), but `new Uint8Array(n)` is
// typed as the wider Uint8Array<ArrayBufferLike>. These are identical at
// runtime for every Uint8Array this package ever constructs; this cast just
// satisfies the type checker at WebCrypto call boundaries.
export function bs(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}
