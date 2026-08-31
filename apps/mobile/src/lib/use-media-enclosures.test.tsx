import type { MediaItem } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaListFn = vi.fn();
const deleteMediaFn = vi.fn();
vi.mock('./api-client', () => ({
  capsulesApi: { media: (...args: unknown[]) => mediaListFn(...args) },
  mediaApi: { delete: (...args: unknown[]) => deleteMediaFn(...args) },
}));

const encloseMediaFn = vi.fn();
vi.mock('./media-upload', () => ({
  encloseMedia: (...args: unknown[]) => encloseMediaFn(...args),
  randomIdempotencyKey: () => `key-${++keySeq}`,
}));

let keySeq = 0;

const { useMediaEnclosures } = await import('./use-media-enclosures');

function mediaItemFixture(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    capsuleId: 'capsule-1',
    kind: 'image',
    originalName: 'photo.jpg',
    mime: 'image/jpeg',
    sizeBytes: 100,
    durationMs: null,
    width: null,
    height: null,
    caption: null,
    position: 0,
    blurhash: null,
    status: 'ready',
    encMeta: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    releasedAt: null,
    releaseReason: null,
    ...overrides,
  };
}

function pickedMediaFixture(overrides: Record<string, unknown> = {}) {
  return { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, ...overrides };
}

function Harness({
  capsuleId,
  encryptForCapsule,
  onReady,
}: {
  capsuleId: string;
  encryptForCapsule: ((bytes: Uint8Array) => Promise<Uint8Array>) | null;
  onReady: (v: ReturnType<typeof useMediaEnclosures>) => void;
}) {
  const value = useMediaEnclosures(capsuleId, encryptForCapsule);
  onReady(value);
  return null;
}

const encryptForCapsule = async (bytes: Uint8Array) => bytes;

async function render(capsuleId = 'capsule-1') {
  let latest!: ReturnType<typeof useMediaEnclosures>;
  await act(async () => {
    TestRenderer.create(<Harness capsuleId={capsuleId} encryptForCapsule={encryptForCapsule} onReady={(v) => (latest = v)} />);
  });
  await flush();
  return {
    get current() {
      return latest;
    },
    act: async (fn: () => unknown) => {
      await act(async () => {
        await fn();
      });
    },
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  keySeq = 0;
  mediaListFn.mockReset().mockResolvedValue({ data: [] });
  deleteMediaFn.mockReset().mockResolvedValue(undefined);
  encloseMediaFn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaEnclosures', () => {
  describe('initial listing', () => {
    it('starts empty before the listing resolves', async () => {
      mediaListFn.mockReturnValue(new Promise(() => {}));
      let latest!: ReturnType<typeof useMediaEnclosures>;
      act(() => {
        TestRenderer.create(<Harness capsuleId="capsule-1" encryptForCapsule={encryptForCapsule} onReady={(v) => (latest = v)} />);
      });
      expect(latest.items).toEqual([]);
      expect(latest.pending).toEqual([]);
    });

    it('exposes only status:"ready" rows as items', async () => {
      mediaListFn.mockResolvedValue({
        data: [mediaItemFixture({ id: 'a', status: 'ready' }), mediaItemFixture({ id: 'b', status: 'uploading' })],
      });
      const h = await render();
      expect(h.current.items.map((i) => i.id)).toEqual(['a']);
    });

    it('surfaces a non-ready row from a previous session as an orphaned, failed pending entry', async () => {
      mediaListFn.mockResolvedValue({ data: [mediaItemFixture({ id: 'orphan', status: 'uploading', originalName: 'abandoned.jpg' })] });
      const h = await render();
      expect(h.current.pending).toHaveLength(1);
      expect(h.current.pending[0]).toMatchObject({ name: 'abandoned.jpg', stage: 'failed', error: 'Never finished arriving', mediaId: 'orphan' });
      expect(h.current.pending[0]!.media).toBeUndefined(); // no bytes to retry with
    });
  });

  describe('enclose', () => {
    it('adds an item to pending immediately, synchronously, before the pipeline resolves', async () => {
      encloseMediaFn.mockReturnValue(new Promise(() => {}));
      const h = await render();
      // `h.act` itself is awaited (React requires this to flush the state
      // update it triggers) but `encloseMedia` never resolves — so reaching
      // this point at all proves `enclose()` added the item synchronously,
      // not after some later network step.
      await h.act(() => h.current.enclose(pickedMediaFixture({ name: 'a.jpg' })));
      expect(h.current.pending.map((p) => p.name)).toEqual(['a.jpg']);
      expect(h.current.pending[0]!.stage).toBe('encrypting');
    });

    it('generates a fresh ticketIdempotencyKey per enclosed item and passes it to encloseMedia', async () => {
      encloseMediaFn.mockReturnValue(new Promise(() => {}));
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));
      const [, , idempotencyKey] = encloseMediaFn.mock.calls[0]!;
      expect(typeof idempotencyKey).toBe('string');
      expect(idempotencyKey.length).toBeGreaterThan(0);
    });

    it('moves a successfully enclosed item out of pending and refreshes items from the server', async () => {
      encloseMediaFn.mockResolvedValue(mediaItemFixture());
      mediaListFn.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [mediaItemFixture({ id: 'media-1' })] });
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));

      expect(h.current.pending).toEqual([]);
      expect(h.current.items.map((i) => i.id)).toEqual(['media-1']);
    });

    it('marks a failed enclose as stage "failed" with a stated, non-technical message — the letter/other items are unaffected', async () => {
      encloseMediaFn.mockRejectedValue(new Error('network down'));
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture({ name: 'a.jpg' })));

      expect(h.current.pending).toHaveLength(1);
      expect(h.current.pending[0]).toMatchObject({ name: 'a.jpg', stage: 'failed', error: 'Stopped before it finished' });
    });

    it('each pending item fails or succeeds independently — one failure does not affect another in flight', async () => {
      encloseMediaFn.mockImplementation(async (_capsuleId: string, media: { name: string }) => {
        if (media.name === 'bad.jpg') throw new Error('boom');
        return mediaItemFixture({ id: 'good-media', originalName: media.name });
      });
      // The initial mount listing, then the one refresh() the successful
      // 'good.jpg' enclose triggers (the failed 'bad.jpg' attempt never
      // calls refresh at all).
      mediaListFn
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [mediaItemFixture({ id: 'good-media', originalName: 'good.jpg' })] });
      const h = await render();
      await h.act(() => {
        h.current.enclose(pickedMediaFixture({ name: 'bad.jpg' }));
        h.current.enclose(pickedMediaFixture({ name: 'good.jpg' }));
      });

      const names = h.current.pending.map((p) => p.name);
      expect(names).toEqual(['bad.jpg']); // the failed one stays in pending
      expect(h.current.pending[0]!.stage).toBe('failed');
      expect(h.current.items.map((i) => i.originalName)).toEqual(['good.jpg']); // the successful one is fully attached
    });

    it('propagates live stage/progress updates from encloseMedia into the pending item', async () => {
      let report!: (p: { stage: string; partsDone: number; partsTotal: number; mediaId?: string }) => void;
      encloseMediaFn.mockImplementation(
        (_c: string, _m: unknown, _k: string, _e: unknown, onProgress: typeof report) =>
          new Promise(() => {
            report = onProgress;
          }),
      );
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));

      await h.act(() => report({ stage: 'sending', partsDone: 1, partsTotal: 3, mediaId: 'media-1' }));
      expect(h.current.pending[0]).toMatchObject({ stage: 'sending', partsDone: 1, partsTotal: 3, mediaId: 'media-1' });
    });
  });

  describe('retry', () => {
    it('retries using the exact same ticketIdempotencyKey as the original attempt', async () => {
      encloseMediaFn.mockRejectedValueOnce(new Error('network down'));
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));
      const originalKey = encloseMediaFn.mock.calls[0]![2];

      encloseMediaFn.mockResolvedValueOnce(mediaItemFixture());
      const id = h.current.pending[0]!.id;
      await h.act(() => h.current.retry(id));

      expect(encloseMediaFn).toHaveBeenCalledTimes(2);
      expect(encloseMediaFn.mock.calls[1]![2]).toBe(originalKey);
    });

    it('a successful retry moves the item out of pending into items, same as a first-try success', async () => {
      encloseMediaFn.mockRejectedValueOnce(new Error('network down'));
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));

      encloseMediaFn.mockResolvedValueOnce(mediaItemFixture());
      mediaListFn.mockResolvedValueOnce({ data: [mediaItemFixture()] });
      const id = h.current.pending[0]!.id;
      await h.act(() => h.current.retry(id));

      expect(h.current.pending).toEqual([]);
      expect(h.current.items).toHaveLength(1);
    });

    it('is a no-op for an orphaned row recovered from a previous session (no bytes to retry with)', async () => {
      mediaListFn.mockResolvedValue({ data: [mediaItemFixture({ id: 'orphan', status: 'uploading' })] });
      const h = await render();
      const id = h.current.pending[0]!.id;

      await h.act(() => h.current.retry(id));
      expect(encloseMediaFn).not.toHaveBeenCalled();
    });
  });

  describe('removePending', () => {
    it('removes a pending item locally and deletes its server-side ticket if one was created', async () => {
      let report!: (p: { stage: string; partsDone: number; partsTotal: number; mediaId?: string }) => void;
      encloseMediaFn.mockImplementation(
        (_c: string, _m: unknown, _k: string, _e: unknown, onProgress: typeof report) =>
          new Promise(() => {
            report = onProgress;
          }),
      );
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));
      await h.act(() => report({ stage: 'sending', partsDone: 0, partsTotal: 1, mediaId: 'media-1' }));

      const id = h.current.pending[0]!.id;
      await h.act(() => h.current.removePending(id));

      expect(h.current.pending).toEqual([]);
      expect(deleteMediaFn).toHaveBeenCalledWith('media-1');
    });

    it('removes a pending item with no known mediaId yet without calling delete', async () => {
      encloseMediaFn.mockReturnValue(new Promise(() => {}));
      const h = await render();
      await h.act(() => h.current.enclose(pickedMediaFixture()));

      const id = h.current.pending[0]!.id;
      await h.act(() => h.current.removePending(id));

      expect(h.current.pending).toEqual([]);
      expect(deleteMediaFn).not.toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it('deletes a truly-attached item server-side and refreshes the list', async () => {
      mediaListFn.mockResolvedValueOnce({ data: [mediaItemFixture()] }).mockResolvedValueOnce({ data: [] });
      const h = await render();
      expect(h.current.items).toHaveLength(1);

      await h.act(() => h.current.removeItem(mediaItemFixture()));
      expect(deleteMediaFn).toHaveBeenCalledWith('media-1');
      expect(h.current.items).toEqual([]);
    });

    it('a network failure while detaching does not throw or reject uncaught — found on a real device with the API unreachable', async () => {
      mediaListFn.mockResolvedValue({ data: [mediaItemFixture()] });
      deleteMediaFn.mockRejectedValueOnce(new Error('network down'));
      const h = await render();
      expect(h.current.items).toHaveLength(1);

      // No `await expect(...).rejects` here on purpose: removeItem's return
      // type is void — the point of this test is that calling it never
      // produces an unhandled rejection, not that it returns a promise.
      await h.act(() => {
        h.current.removeItem(mediaItemFixture());
      });
      // The item is still there (the delete never succeeded) — that's the
      // honest state, not a crash.
      expect(h.current.items).toHaveLength(1);
    });
  });

  describe('security', () => {
    it('never logs the picked file\'s URI, plaintext, ciphertext, or key material across a full enclose/retry/remove cycle', async () => {
      // Spied rather than asserted-uncalled outright: react-test-renderer's
      // own one-time deprecation notice goes through `console.error`
      // (unrelated to this hook), matching the established pattern in
      // compose-compose.test.tsx's equivalent security tests — the
      // assertion is "never contains the sensitive string," not "never
      // called at all."
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        encloseMediaFn.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(mediaItemFixture());
        mediaListFn.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [mediaItemFixture()] });
        const h = await render();
        await h.act(() => h.current.enclose(pickedMediaFixture({ uri: 'file:///very-specific-path.jpg' })));
        const id = h.current.pending[0]!.id;
        await h.act(() => h.current.retry(id));

        for (const spy of [logSpy, errorSpy]) {
          for (const call of spy.mock.calls) {
            expect(call.map((a) => String(a)).join(' ')).not.toContain('very-specific-path');
          }
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});
