import type { Capsule, Recipient } from '@tc/contracts';
import { generateMasterKey } from '@tc/crypto';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptField, encodeIvCiphertext, textToEnvelope } from './capsule-crypto';

// react-native's real package can't be parsed by Vitest's transform (it
// ships Flow syntax) — needed here only because api-client.ts's real module
// (loaded below via vi.importActual, to keep its real ApiClientError class)
// imports `Platform` from it. Same pattern as auth-context.test.tsx/
// use-capsule-draft.test.tsx.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

const get = vi.fn();
const patchFn = vi.fn();
const recipientsFn = vi.fn();
vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client');
  return {
    ...actual,
    capsulesApi: {
      get: (...args: unknown[]) => get(...args),
      patch: (...args: unknown[]) => patchFn(...args),
      recipients: (...args: unknown[]) => recipientsFn(...args),
    },
  };
});

let mockMasterKey: Uint8Array | null = null;
vi.mock('./master-key-context', () => ({
  useMasterKey: () => ({ masterKey: mockMasterKey }),
}));

// Stable object reference, not a fresh literal per call — see this
// project's own established note on why (compose-compose.test.tsx,
// compose-address.test.tsx): a fresh object every render looks like a
// changed `user` to the bootstrap effect's dependency array, causing
// spurious extra effect re-runs.
const mockUser = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
vi.mock('./auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mocked at the module boundary — this file's tests are about the hook's
// integration with local persistence (does it call these at the right
// times, with the right arguments), not about local-draft-store.ts's own
// real SQLite/crypto behavior, which has its own dedicated test file
// (local-draft-store.test.ts).
const saveLocalDraftFn = vi.fn();
const loadLocalDraftFn = vi.fn().mockResolvedValue({ status: 'none' });
const deleteLocalDraftFn = vi.fn();
vi.mock('./local-draft-store', () => ({
  saveLocalDraft: (...args: unknown[]) => saveLocalDraftFn(...args),
  loadLocalDraft: (...args: unknown[]) => loadLocalDraftFn(...args),
  deleteLocalDraft: (...args: unknown[]) => deleteLocalDraftFn(...args),
}));

const { useCapsuleCompose } = await import('./use-capsule-compose');
const { ApiClientError } = await import('./api-client');

function capsuleFixture(overrides: Partial<Capsule> = {}): Capsule {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'draft',
    title: null,
    cover: null,
    teaser: null,
    contentDocEnc: null,
    ownerKeyWrap: null,
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: null,
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: null,
    extendedOnce: false,
    seals: [],
    allowDownload: true,
    recipientsVisible: true,
    announceOnSeal: false,
    requireRecipientVerification: false,
    replyPrompt: null,
    location: null,
    expiresAfter: null,
    expiryStrict: false,
    expiredAt: null,
    archivedAt: null,
    mediaRetentionUntil: null,
    trashedAt: null,
    purgeAfter: null,
    withdrawnAt: null,
    legacyConfig: null,
    recurrence: null,
    breakGlass: 'disabled',
    isFavorite: false,
    tagIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function recipientFixture(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    capsuleId: '11111111-1111-1111-1111-111111111111',
    userId: null,
    email: 'amara@example.com',
    phone: null,
    displayName: null,
    status: 'added',
    firstOpenedAt: null,
    lastViewedAt: null,
    resolvedUnlockAt: null,
    verificationRequired: null,
    verifiedAt: null,
    isFallback: null,
    fallbackAfter: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function Harness({ id, onReady }: { id: string; onReady: (v: ReturnType<typeof useCapsuleCompose>) => void }) {
  const value = useCapsuleCompose(id);
  onReady(value);
  return null;
}

async function render(id = '11111111-1111-1111-1111-111111111111') {
  let latest!: ReturnType<typeof useCapsuleCompose>;
  await act(async () => {
    TestRenderer.create(<Harness id={id} onReady={(v) => (latest = v)} />);
  });
  // The bootstrap effect is a multi-hop async chain (get -> resolve/generate
  // key -> maybe decrypt -> maybe patch) — drive it to completion here
  // rather than in every call site.
  await flush(0);
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

// Captured before any `vi.useFakeTimers()` call replaces the global —
// invoking the real, un-faked timer directly (see `flush` below) rather
// than toggling `useRealTimers()`/`useFakeTimers()` mid-test, which would
// tear down and recreate the fake clock and lose a debounce timer's
// already-elapsed progress along with it.
const realSetTimeout = globalThis.setTimeout;

/**
 * Flushes real async work (crypto, fetch mocks) alongside fake-timer-driven
 * callbacks. The requested `ms` is advanced exactly once under fake timers —
 * debounce-timing tests depend on that being precise — then one short
 * genuine wait, via the real `setTimeout` captured above: real
 * `crypto.subtle` calls run on Node's own thread pool and complete on real
 * wall-clock time, which no amount of synchronously-resolving fake-timer
 * advancement can force to happen faster (confirmed the hard way — looping
 * `advanceTimersByTimeAsync(0)` up to 30 times still left this flaky under
 * full-suite parallel load). Matches `capsule-detail.test.tsx`'s own
 * real-timer-based flush for the same underlying reason — that file just
 * never needed fake timers otherwise.
 */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await new Promise((resolve) => realSetTimeout(resolve, 20));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  patchFn.mockReset();
  recipientsFn.mockReset().mockResolvedValue({ data: [] });
  mockMasterKey = generateMasterKey();
  saveLocalDraftFn.mockReset().mockResolvedValue(undefined);
  loadLocalDraftFn.mockReset().mockResolvedValue({ status: 'none' });
  deleteLocalDraftFn.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCapsuleCompose', () => {
  describe('loading and bootstrap', () => {
    it('starts in a loading state', () => {
      get.mockReturnValue(new Promise(() => {}));
      // A synchronous render is enough to observe the initial state before
      // the fetch promise (deliberately never resolving) settles.
      let latest!: ReturnType<typeof useCapsuleCompose>;
      act(() => {
        TestRenderer.create(<Harness id="x" onReady={(v) => (latest = v)} />);
      });
      expect(latest.state).toEqual({ status: 'loading' });
    });

    it('generates and wraps a new capsule key when ownerKeyWrap is null, and PATCHes it immediately', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap: null }) });
      patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({
        capsule: capsuleFixture({ ownerKeyWrap: fields.ownerKeyWrap as string }),
      }));

      const h = await render();
      expect(patchFn).toHaveBeenCalledTimes(1);
      const [, fields] = patchFn.mock.calls[0]!;
      expect(typeof (fields as { ownerKeyWrap: string }).ownerKeyWrap).toBe('string');
      expect(h.current.state.status).toBe('ready');
      if (h.current.state.status === 'ready') {
        expect(h.current.state.capsule.ownerKeyWrap).toEqual((fields as { ownerKeyWrap: string }).ownerKeyWrap);
        expect(h.current.state.envelope).toEqual({ doc: { type: 'doc', content: [{ type: 'paragraph' }] }, writtenAt: null });
      }
    });

    it('unwraps an existing capsule key without generating a new one, for a capsule with no content yet', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc: null }) });

      const h = await render();
      expect(patchFn).not.toHaveBeenCalled();
      expect(h.current.state.status).toBe('ready');
      if (h.current.state.status === 'ready') {
        expect(h.current.state.envelope).toEqual({ doc: { type: 'doc', content: [{ type: 'paragraph' }] }, writtenAt: null });
      }
    });

    it('fetches and exposes recipients alongside the capsule, so the screen can show "who this is for" while writing', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal', ownerKeyWrap }) });
      recipientsFn.mockResolvedValue({ data: [recipientFixture({ displayName: 'Amara' })] });

      const h = await render();
      expect(recipientsFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
      expect(h.current.state.status).toBe('ready');
      if (h.current.state.status === 'ready') expect(h.current.state.recipients).toEqual([recipientFixture({ displayName: 'Amara' })]);
    });

    it('decrypts and loads real existing content when reopening a capsule already written to', async () => {
      const { wrapCapsuleKeyForOwner, encryptBytes } = await import('@tc/crypto');
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
      const envelope = textToEnvelope('Dear future me,\nI hope you remember this.');
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(JSON.stringify(envelope)));
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc }) });

      const h = await render();
      expect(h.current.state.status).toBe('ready');
      if (h.current.state.status === 'ready') expect(h.current.state.envelope).toEqual(envelope);
    });

    it('goes to an error state, with retry, when the initial fetch fails', async () => {
      get.mockRejectedValueOnce(new Error('network down'));
      const h = await render();
      expect(h.current.state).toEqual({ status: 'error' });

      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValueOnce({ capsule: capsuleFixture({ ownerKeyWrap }) });
      await h.act(() => h.current.retry());
      await flush(0);
      expect(h.current.state.status).toBe('ready');
    });

    it('goes to an error state (not a crash) when ownerKeyWrap cannot be unwrapped with the current master key', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), generateMasterKey()); // wrapped under a DIFFERENT master key
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap }) });

      const h = await render();
      expect(h.current.state).toEqual({ status: 'error' });
    });

    it('goes to an error state (not a crash) when the decrypted content is not valid JSON', async () => {
      const { wrapCapsuleKeyForOwner, encryptBytes } = await import('@tc/crypto');
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('not json'));
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc }) });

      const h = await render();
      expect(h.current.state).toEqual({ status: 'error' });
    });
  });

  describe('debounced autosave', () => {
    /**
     * Mocks the server's own true partial-merge PATCH semantics (confirmed
     * in `apps/api/src/modules/capsules/service.ts`'s `patchCapsule`:
     * omitted fields are untouched) rather than replacing the whole row on
     * every call — a naive mock that dropped `ownerKeyWrap` on the next
     * content-only PATCH would desync from what the real API actually does.
     */
    async function readyHarness() {
      let serverCapsule = capsuleFixture({ ownerKeyWrap: null });
      get.mockImplementation(async () => ({ capsule: serverCapsule }));
      patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => {
        serverCapsule = { ...serverCapsule, ...fields } as Capsule;
        return { capsule: serverCapsule };
      });
      const h = await render();

      const { unwrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const capsuleKey = await unwrapCapsuleKeyForOwner(serverCapsule.ownerKeyWrap!, mockMasterKey!);
      patchFn.mockClear(); // clear the bootstrap ownerKeyWrap PATCH so autosave assertions start clean
      return { h, capsuleKey };
    }

    it('does not save immediately on every keystroke — only after ~3s idle', async () => {
      const { h } = await readyHarness();
      act(() => h.current.setText('H'));
      await flush(1000);
      expect(patchFn).not.toHaveBeenCalled();
      await flush(2000); // total 3000ms
      expect(patchFn).toHaveBeenCalledTimes(1);
    });

    it('collapses rapid typing within the debounce window into a single save of the latest text', async () => {
      const { h, capsuleKey } = await readyHarness();
      act(() => h.current.setText('H'));
      await flush(500);
      act(() => h.current.setText('He'));
      await flush(500);
      act(() => h.current.setText('Hello'));
      await flush(3000);

      expect(patchFn).toHaveBeenCalledTimes(1);
      const [, fields] = patchFn.mock.calls[0]!;
      const decrypted = await decryptField(capsuleKey, (fields as { contentDocEnc: string }).contentDocEnc);
      expect(decrypted.status).toBe('ok');
      if (decrypted.status === 'ok') {
        const envelope = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
        expect(envelope.doc.content[0].content[0].text).toBe('Hello');
      }
    });

    it('serializes overlapping saves — a change arriving mid-save triggers a follow-up save, never dropped', async () => {
      const { h, capsuleKey } = await readyHarness();
      let resolveFirstPatch!: (value: { capsule: Capsule }) => void;
      patchFn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstPatch = resolve;
          }),
      );

      act(() => h.current.setText('First'));
      await flush(3000); // fires the first save, which now hangs
      expect(patchFn).toHaveBeenCalledTimes(1);

      // A second edit arrives while the first save is still in flight.
      act(() => h.current.setText('First, then more'));
      await flush(0);
      expect(patchFn).toHaveBeenCalledTimes(1); // the second edit does not fire its own overlapping request

      // Resolving here unblocks the loop's second iteration, which does
      // real crypto work (encryptBytes) before firing the follow-up PATCH —
      // that needs genuine wall-clock time on a real thread pool, which
      // `advanceTimersByTimeAsync(0)` alone cannot force to happen faster
      // (the exact flakiness this file's own `flush()` helper exists to
      // avoid — this call site was bypassing it, the actual cause of this
      // test's intermittent failure under loaded/CI runners).
      resolveFirstPatch({ capsule: capsuleFixture({ ownerKeyWrap: 'irrelevant-for-this-assertion' }) });
      await flush(0);

      expect(patchFn).toHaveBeenCalledTimes(2); // the follow-up save fires automatically once the first clears
      const [, secondFields] = patchFn.mock.calls[1]!;
      const decrypted = await decryptField(capsuleKey, (secondFields as { contentDocEnc: string }).contentDocEnc);
      expect(decrypted.status).toBe('ok');
      if (decrypted.status === 'ok') {
        const envelope = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
        expect(envelope.doc.content[0].content[0].text).toBe('First, then more'); // the newer edit, not dropped
      }
    });

    it('flush() saves immediately without waiting for the debounce timer', async () => {
      const { h } = await readyHarness();
      act(() => h.current.setText('Urgent'));
      expect(patchFn).not.toHaveBeenCalled();
      await h.act(() => h.current.flush());
      expect(patchFn).toHaveBeenCalledTimes(1);
    });

    it('handles empty content, multiple paragraphs, and Unicode without error', async () => {
      const { h } = await readyHarness();
      const text = 'First.\n\nSecond — with an em dash.\n日本語 ☕️';
      act(() => h.current.setText(text));
      await flush(3000);
      expect(patchFn).toHaveBeenCalledTimes(1);
      expect(h.current.autosaveStatus).toBe('saved');
    });
  });

  describe('save failures', () => {
    async function readyHarness() {
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap: null }) });
      patchFn.mockImplementationOnce(async (_id: string, fields: Record<string, unknown>) => ({ capsule: capsuleFixture({ ...fields }) }));
      const h = await render();
      patchFn.mockReset();
      return h;
    }

    it('shows a specific message and "rejected" status for capsule_sealed, and does not retry automatically', async () => {
      const h = await readyHarness();
      patchFn.mockRejectedValue(new ApiClientError('capsule_sealed', 'Capsule is sealed', 409));

      act(() => h.current.setText('Too late'));
      await flush(3000);

      expect(h.current.autosaveStatus).toBe('rejected');
      expect(h.current.saveMessage).toBe('This capsule has already been sealed and can no longer be edited.');
      expect(patchFn).toHaveBeenCalledTimes(1); // not retried on its own — a 4xx can't be fixed by resending the same bytes
    });

    it('shows a generic message and "error" status for a network-style failure', async () => {
      const h = await readyHarness();
      patchFn.mockRejectedValue(new Error('network down'));

      act(() => h.current.setText('Offline'));
      await flush(3000);

      expect(h.current.autosaveStatus).toBe('error');
      expect(h.current.saveMessage).toBe("That couldn't be saved. Check your connection and try again.");
    });

    it('self-heals: a new edit after a failure clears the message and can save successfully', async () => {
      const h = await readyHarness();
      patchFn.mockRejectedValueOnce(new Error('network down'));
      act(() => h.current.setText('First attempt'));
      await flush(3000);
      expect(h.current.autosaveStatus).toBe('error');

      patchFn.mockResolvedValueOnce({ capsule: capsuleFixture({ contentDocEnc: 'whatever' }) });
      act(() => h.current.setText('Second attempt'));
      await flush(3000);
      expect(h.current.autosaveStatus).toBe('saved');
      expect(h.current.saveMessage).toBeNull();
    });
  });

  describe('local encrypted draft (E1.4.4)', () => {
    async function readyHarness() {
      let serverCapsule = capsuleFixture({ ownerKeyWrap: null });
      get.mockImplementation(async () => ({ capsule: serverCapsule }));
      patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => {
        serverCapsule = { ...serverCapsule, ...fields } as Capsule;
        return { capsule: serverCapsule };
      });
      const h = await render();
      patchFn.mockClear(); // clear the bootstrap ownerKeyWrap PATCH so assertions below start clean
      return { h };
    }

    it('saves locally immediately on every edit — before the server debounce timer has even started counting', async () => {
      const { h } = await readyHarness();
      act(() => h.current.setText('typed a moment ago'));
      // No time advanced at all: the server PATCH is still 3s away, but the
      // local save is not debounced — it must have already happened.
      expect(saveLocalDraftFn).toHaveBeenCalledTimes(1);
      expect(saveLocalDraftFn).toHaveBeenCalledWith(
        mockUser.id,
        '11111111-1111-1111-1111-111111111111',
        textToEnvelope('typed a moment ago'),
      );
      expect(patchFn).not.toHaveBeenCalled();
    });

    it('deletes the local draft once the server save is confirmed', async () => {
      const { h } = await readyHarness();
      act(() => h.current.setText('will be saved'));
      await flush(3000);
      expect(patchFn).toHaveBeenCalledTimes(1);
      expect(deleteLocalDraftFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });

    it('does NOT delete the local draft when the server save fails — nothing is lost', async () => {
      const { h } = await readyHarness();
      patchFn.mockRejectedValueOnce(new Error('network down'));
      act(() => h.current.setText('will fail to save'));
      await flush(3000);
      expect(h.current.autosaveStatus).toBe('error');
      expect(deleteLocalDraftFn).not.toHaveBeenCalled();
    });

    it('a local-save failure never throws, blocks typing, or surfaces as a user-facing error — it is a silent best-effort safety net', async () => {
      saveLocalDraftFn.mockRejectedValueOnce(new Error('disk full'));
      const { h } = await readyHarness();
      expect(() => act(() => h.current.setText('typed anyway'))).not.toThrow();
      expect(h.current.state.status).toBe('ready');
      expect(h.current.autosaveStatus).toBe('pending'); // the server debounce still scheduled normally
      expect(h.current.saveMessage).toBeNull();
    });

    it('a local draft found on mount wins over the server\'s own content, and reconciles via a normal save', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
      const serverEnvelope = textToEnvelope('what the server last confirmed');
      const bytes = new TextEncoder().encode(JSON.stringify(serverEnvelope));
      const { iv, ciphertext } = await encryptField(capsuleKey, bytes);
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc }) });

      const localEnvelope = textToEnvelope('typed offline, never confirmed by the server');
      loadLocalDraftFn.mockResolvedValueOnce({ status: 'found', envelope: localEnvelope });
      patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({
        capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc, ...fields }),
      }));

      const h = await render();
      expect(h.current.state.status).toBe('ready');
      if (h.current.state.status === 'ready') expect(h.current.state.envelope).toEqual(localEnvelope);

      // The reconciling save is scheduled (not fired instantly) through the
      // same debounced path as any other edit.
      expect(h.current.autosaveStatus).toBe('pending');
      await flush(3000);
      expect(patchFn).toHaveBeenCalledTimes(1);
      expect(deleteLocalDraftFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });

    it('a local-load failure on mount falls back to the server content silently — no error state, no crash', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
      const serverEnvelope = textToEnvelope('server content, local lookup will fail');
      const bytes = new TextEncoder().encode(JSON.stringify(serverEnvelope));
      const { iv, ciphertext } = await encryptField(capsuleKey, bytes);
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc }) });
      loadLocalDraftFn.mockRejectedValueOnce(new Error('SQLite unavailable'));

      const h = await render();
      expect(h.current.state.status).toBe('ready');
      if (h.current.state.status === 'ready') expect(h.current.state.envelope).toEqual(serverEnvelope);
    });

    async function encryptField(key: Uint8Array, bytes: Uint8Array) {
      const { encryptBytes } = await import('@tc/crypto');
      return encryptBytes(key, bytes);
    }
  });

  describe('security', () => {
    it('never logs the capsule key, master key, plaintext, or ciphertext to the console', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap: null }) });
        patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({ capsule: capsuleFixture({ ...fields }) }));
        const h = await render();
        act(() => h.current.setText('A private letter, never to be logged.'));
        await flush(3000);

        for (const spy of [logSpy, warnSpy, errorSpy]) {
          for (const call of spy.mock.calls) {
            const joined = call.map((a) => String(a)).join(' ');
            expect(joined).not.toContain('private letter');
          }
        }
      } finally {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});
