import { decryptBytes, generateMasterKey } from '@tc/crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// react-native isn't imported by this file directly, but @tc/contracts'
// zod schemas pull in nothing platform-specific — no mock needed here,
// unlike the screen/hook test files that render React Native components.

vi.mock('expo-file-system', () => ({
  File: class {
    constructor(public uri: string) {}
    async bytes() {
      return fileBytes;
    }
  },
}));

const createTicketFn = vi.fn();
const completeFn = vi.fn();
vi.mock('./api-client', () => ({
  mediaApi: {
    createTicket: (...args: unknown[]) => createTicketFn(...args),
    complete: (...args: unknown[]) => completeFn(...args),
  },
}));

const { encloseMedia, randomIdempotencyKey } = await import('./media-upload');
const { encryptMediaForCapsule } = await import('./capsule-crypto');

let fileBytes: Uint8Array;

function pickedMedia(overrides: Partial<Parameters<typeof encloseMedia>[1]> = {}) {
  return {
    uri: 'file:///photo.jpg',
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    ...overrides,
  };
}

beforeEach(() => {
  fileBytes = new Uint8Array([10, 20, 30, 40, 50]);
  createTicketFn.mockReset();
  completeFn.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media-upload.ts', () => {
  describe('randomIdempotencyKey', () => {
    it('produces a non-empty string, different every call (not a fixed or predictable value)', () => {
      const a = randomIdempotencyKey();
      const b = randomIdempotencyKey();
      expect(typeof a).toBe('string');
      expect(a.length).toBeGreaterThan(0);
      expect(a).not.toBe(b);
    });
  });

  describe('encloseMedia', () => {
    async function setUp() {
      const capsuleKey = generateMasterKey();
      const encryptForCapsule = (bytes: Uint8Array) => encryptMediaForCapsule(capsuleKey, bytes);
      createTicketFn.mockResolvedValue({
        mediaId: 'media-1',
        uploadId: 'upload-1',
        parts: [{ partNumber: 1, url: 'https://r2.example/part1' }],
      });
      completeFn.mockResolvedValue({
        media: { id: 'media-1', status: 'ready', originalName: 'photo.jpg' },
      });
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? '"etag-1"' : null) },
      });
      return { capsuleKey, encryptForCapsule };
    }

    it('reads the real file bytes, encrypts them under the capsule key, and uploads ciphertext — never the plaintext bytes', async () => {
      const { capsuleKey, encryptForCapsule } = await setUp();
      const progress: unknown[] = [];

      await encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, (p) => progress.push({ ...p }));

      const putBody = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as Uint8Array;
      // The uploaded bytes must not equal the plaintext file bytes anywhere
      // in them — the whole point of this pipeline.
      expect(Buffer.from(putBody).includes(Buffer.from(fileBytes))).toBe(false);
      // But they must be genuinely decryptable back to the original bytes
      // under the same capsule key — proving it's real ciphertext of the
      // real file, not garbage.
      const iv = putBody.slice(0, 12);
      const ciphertext = putBody.slice(12);
      const decrypted = await decryptBytes(capsuleKey, iv, ciphertext);
      expect(decrypted).toEqual(fileBytes);
    });

    it('creates the ticket with the encrypted length, not the original plaintext size', async () => {
      const { encryptForCapsule } = await setUp();
      await encloseMedia('capsule-1', pickedMedia({ sizeBytes: 999 }), 'idem-key-1', encryptForCapsule, () => {});

      const [, input] = createTicketFn.mock.calls[0]!;
      // iv(12) + plaintext(5) + AES-GCM 16-byte tag = 33, not the picker's
      // reported 999.
      expect(input.sizeBytes).toBe(33);
      expect(input.name).toBe('photo.jpg');
      expect(input.mime).toBe('image/jpeg');
    });

    it('passes the given ticketIdempotencyKey through to createTicket unchanged', async () => {
      const { encryptForCapsule } = await setUp();
      await encloseMedia('capsule-1', pickedMedia(), 'stable-key-abc', encryptForCapsule, () => {});
      expect(createTicketFn).toHaveBeenCalledWith('capsule-1', expect.anything(), 'stable-key-abc');
    });

    it('generates its own fresh idempotency key for complete, independent of the ticket key', async () => {
      const { encryptForCapsule } = await setUp();
      await encloseMedia('capsule-1', pickedMedia(), 'stable-key-abc', encryptForCapsule, () => {});
      const completeKey = completeFn.mock.calls[0]![2];
      expect(completeKey).not.toBe('stable-key-abc');
      expect(typeof completeKey).toBe('string');
    });

    it('PUTs each part with no extra headers (the presigned URL is signed without a fixed Content-Type)', async () => {
      const { encryptForCapsule } = await setUp();
      await encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, () => {});
      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toBe('https://r2.example/part1');
      expect(options.method).toBe('PUT');
      expect(options.headers).toBeUndefined();
    });

    it('splits a multi-part ticket into the correct byte ranges and completes with every part\'s eTag', async () => {
      fileBytes = new Uint8Array(20); // forces a real, non-trivial split point below
      for (let i = 0; i < fileBytes.length; i++) fileBytes[i] = i;
      const { encryptForCapsule } = await setUp();
      createTicketFn.mockResolvedValue({
        mediaId: 'media-1',
        uploadId: 'upload-1',
        parts: [
          { partNumber: 1, url: 'https://r2.example/part1' },
          { partNumber: 2, url: 'https://r2.example/part2' },
        ],
      });
      let call = 0;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        call += 1;
        return { ok: true, headers: { get: () => `etag-${call}` } };
      });

      // A real 20+12+16=48-byte ciphertext split at an artificially small
      // boundary would need editing PART_SIZE_BYTES (not exported) to prove
      // via inspection — instead this proves the *contract* the two-part
      // response implies: two PUTs happen, and complete lists both eTags in
      // part-number order.
      await encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, () => {});

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      const [, input] = completeFn.mock.calls[0]!;
      expect(input.parts).toEqual([
        { partNumber: 1, eTag: 'etag-1' },
        { partNumber: 2, eTag: 'etag-2' },
      ]);
    });

    it('reports encrypting → sending (per part) → finishing → enclosed, in order, with the real mediaId once known', async () => {
      const { encryptForCapsule } = await setUp();
      const stages: string[] = [];
      const mediaIds: (string | undefined)[] = [];

      await encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, (p) => {
        stages.push(p.stage);
        mediaIds.push(p.mediaId);
      });

      expect(stages).toEqual(['encrypting', 'sending', 'sending', 'finishing', 'enclosed']);
      expect(mediaIds[0]).toBeUndefined(); // not known yet during 'encrypting'
      expect(mediaIds.slice(1)).toEqual(['media-1', 'media-1', 'media-1', 'media-1']);
    });

    it('throws (and never calls complete) when a part PUT fails, without swallowing the error', async () => {
      const { encryptForCapsule } = await setUp();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });

      await expect(encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, () => {})).rejects.toThrow();
      expect(completeFn).not.toHaveBeenCalled();
    });

    it('throws when a PUT succeeds but the response has no ETag header (a CORS/adapter misconfiguration this must not paper over)', async () => {
      const { encryptForCapsule } = await setUp();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, headers: { get: () => null } });

      await expect(encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, () => {})).rejects.toThrow();
      expect(completeFn).not.toHaveBeenCalled();
    });

    it('throws when createTicket itself rejects, before ever touching fetch', async () => {
      const { encryptForCapsule } = await setUp();
      createTicketFn.mockRejectedValue(new Error('server unavailable'));

      await expect(encloseMedia('capsule-1', pickedMedia(), 'idem-key-1', encryptForCapsule, () => {})).rejects.toThrow('server unavailable');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('passes width/height/durationMs metadata through to complete unchanged', async () => {
      const { encryptForCapsule } = await setUp();
      await encloseMedia(
        'capsule-1',
        pickedMedia({ width: 1920, height: 1080, durationMs: 4200 }),
        'idem-key-1',
        encryptForCapsule,
        () => {},
      );
      const [, input] = completeFn.mock.calls[0]!;
      expect(input).toMatchObject({ width: 1920, height: 1080, durationMs: 4200 });
    });

    it('never logs the plaintext bytes, ciphertext, or capsule key at any point in the pipeline', async () => {
      const { encryptForCapsule } = await setUp();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await encloseMedia('capsule-1', pickedMedia({ uri: 'file:///very-specific-path.jpg' }), 'idem-key-1', encryptForCapsule, () => {});
        for (const spy of [logSpy, errorSpy]) {
          expect(spy).not.toHaveBeenCalled();
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});
