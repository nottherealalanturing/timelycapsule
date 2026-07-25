import { describe, expect, it } from 'vitest';
import { decryptBytes, decryptStream, encryptBytes, encryptStream } from './aes.js';
import { generateAesKey } from './random.js';

describe('encryptBytes / decryptBytes', () => {
  it('round-trips', async () => {
    const key = generateAesKey();
    const plaintext = new TextEncoder().encode('hello capsule');
    const { iv, ciphertext } = await encryptBytes(key, plaintext);
    const decrypted = await decryptBytes(key, iv, ciphertext);
    expect(new TextDecoder().decode(decrypted)).toBe('hello capsule');
  });

  it('fails to decrypt with the wrong key', async () => {
    const key = generateAesKey();
    const wrongKey = generateAesKey();
    const { iv, ciphertext } = await encryptBytes(key, new TextEncoder().encode('secret'));
    await expect(decryptBytes(wrongKey, iv, ciphertext)).rejects.toThrow();
  });

  it('authenticates AAD', async () => {
    const key = generateAesKey();
    const aad = new TextEncoder().encode('capsule-id-123');
    const { iv, ciphertext } = await encryptBytes(key, new TextEncoder().encode('secret'), aad);
    await expect(decryptBytes(key, iv, ciphertext, new TextEncoder().encode('wrong-aad'))).rejects.toThrow();
  });
});

async function* toAsyncIterable(chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe('encryptStream / decryptStream', () => {
  it('round-trips multi-chunk content', async () => {
    const key = generateAesKey();
    const chunkA = crypto.getRandomValues(new Uint8Array(10));
    const chunkB = crypto.getRandomValues(new Uint8Array(10));
    const frames = await collect(encryptStream(key, toAsyncIterable([chunkA, chunkB]), 10));

    const decryptedChunks = await collect(decryptStream(key, toAsyncIterable(frames)));
    const decrypted = new Uint8Array(decryptedChunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of decryptedChunks) {
      decrypted.set(c, offset);
      offset += c.length;
    }

    expect(decrypted).toEqual(new Uint8Array([...chunkA, ...chunkB]));
  });

  it('rejects tampered chunk data', async () => {
    const key = generateAesKey();
    const chunk = crypto.getRandomValues(new Uint8Array(20));
    const frames = await collect(encryptStream(key, toAsyncIterable([chunk]), 20));

    const tampered = frames.map((f) => f.slice());
    const secondFrame = tampered[1]!;
    secondFrame[0] = (secondFrame[0] ?? 0) ^ 0xff;

    await expect(collect(decryptStream(key, toAsyncIterable(tampered)))).rejects.toThrow();
  });

  it('detects a truncated stream (trailing chunks dropped)', async () => {
    const key = generateAesKey();
    const chunkA = crypto.getRandomValues(new Uint8Array(10));
    const chunkB = crypto.getRandomValues(new Uint8Array(10));
    const chunkC = crypto.getRandomValues(new Uint8Array(10));
    const frames = await collect(encryptStream(key, toAsyncIterable([chunkA, chunkB, chunkC]), 10));

    // Drop the real final chunk — what's left decrypts fine on its own, but
    // the second-to-last chunk was encrypted with isFinal=false, so
    // presenting it to decryptStream as if it were the last one must fail.
    const truncated = frames.slice(0, -1);
    await expect(collect(decryptStream(key, toAsyncIterable(truncated)))).rejects.toThrow();
  });

  it('still decrypts a genuinely single-chunk stream correctly', async () => {
    const key = generateAesKey();
    const chunk = crypto.getRandomValues(new Uint8Array(10));
    const frames = await collect(encryptStream(key, toAsyncIterable([chunk]), 10));
    const decrypted = await collect(decryptStream(key, toAsyncIterable(frames)));
    expect(decrypted).toHaveLength(1);
    expect(decrypted[0]).toEqual(chunk);
  });
});
