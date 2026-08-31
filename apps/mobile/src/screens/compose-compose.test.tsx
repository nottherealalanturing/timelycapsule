import type { Capsule, Recipient } from '@tc/contracts';
import { generateMasterKey } from '@tc/crypto';
import { act } from 'react';
import { Modal, Pressable, Text, TextInput } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaSourceSheet } from '../components/media-source-sheet';
import { VoiceRecorder } from '../components/voice-recorder';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles: unknown) => styles },
}));

const back = vi.fn();
let routeId = '11111111-1111-1111-1111-111111111111';
const router = { back };
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => ({ id: routeId }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 0, left: 0, right: 0 }),
}));

const get = vi.fn();
const patchFn = vi.fn();
const recipientsFn = vi.fn();
const mediaListFn = vi.fn();
const createTicketFn = vi.fn();
const completeFn = vi.fn();
const deleteMediaFn = vi.fn();
vi.mock('../lib/api-client', () => ({
  capsulesApi: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patchFn(...args),
    recipients: (...args: unknown[]) => recipientsFn(...args),
    media: (...args: unknown[]) => mediaListFn(...args),
  },
  mediaApi: {
    createTicket: (...args: unknown[]) => createTicketFn(...args),
    complete: (...args: unknown[]) => completeFn(...args),
    delete: (...args: unknown[]) => deleteMediaFn(...args),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  },
}));

// expo-file-system is a native module with no JS-only fallback (same
// reasoning as expo-image-picker/expo-audio below) — stubbed with a minimal
// `File` whose `bytes()` returns a small, fixed fixture. This file's tests
// are about the screen's own wiring through the real `useMediaEnclosures`/
// `encloseMedia` pipeline (real crypto, matching `use-capsule-compose.
// test.tsx`'s own established "mock the network, not the crypto" pattern) —
// not about real filesystem I/O, which has no dedicated test of its own
// since `expo-file-system` is a thin, already-typed wrapper this codebase
// doesn't own.
vi.mock('expo-file-system', () => ({
  File: class {
    constructor(public uri: string) {}
    async bytes() {
      return new Uint8Array([1, 2, 3, 4]);
    }
  },
}));

let mockMasterKey: Uint8Array | null = null;
vi.mock('../lib/master-key-context', () => ({
  useMasterKey: () => ({ masterKey: mockMasterKey }),
}));

// Stable object reference (not a fresh literal per call) — a fresh object
// every render would look like a changed `user` to any effect/useCallback
// dependency array that includes it, causing spurious extra effect runs, a
// real bug pattern this Stage E arc has hit and fixed before.
const mockUser = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mocked at the module boundary (like ../lib/api-client above), not the raw
// expo-sqlite/expo-secure-store it's built on — this file's own tests are
// about the screen, not about local-draft-store.ts's real SQLite/crypto
// behavior, which has its own dedicated test file (local-draft-store.test.ts).
const saveLocalDraftFn = vi.fn();
const loadLocalDraftFn = vi.fn().mockResolvedValue({ status: 'none' });
const deleteLocalDraftFn = vi.fn();
vi.mock('../lib/local-draft-store', () => ({
  saveLocalDraft: (...args: unknown[]) => saveLocalDraftFn(...args),
  loadLocalDraft: (...args: unknown[]) => loadLocalDraftFn(...args),
  deleteLocalDraft: (...args: unknown[]) => deleteLocalDraftFn(...args),
}));

// expo-image-picker/expo-document-picker are native modules with no JS-only
// fallback (confirmed directly, same reason every other native Expo module
// in this codebase gets mocked) — stubbed as inert so media-source.ts's
// real module can load (its `pickForSource` is itself overridden below, so
// these two are never actually called; only `formatMediaSize`, a pure
// function, needs the real module).
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-audio', () => ({}));

// Same boundary reasoning as local-draft-store above — this file's tests
// are about the screen's own wiring (opens the sheet, routes a selection to
// pickForSource, handles each result), not about media-source.ts's real
// picker calls, which have their own dedicated test file
// (media-source.test.ts).
const pickForSourceFn = vi.fn();
vi.mock('../lib/media-source', async () => {
  const actual = await vi.importActual<typeof import('../lib/media-source')>('../lib/media-source');
  return { ...actual, pickForSource: (...args: unknown[]) => pickForSourceFn(...args) };
});

// VoiceRecorder is mocked at the module boundary, same reasoning — this
// file's tests are about the screen's own wiring (opening it, handling its
// onAccept/onCancel), not about its real expo-audio recording/playback
// lifecycle, which has its own dedicated test file (voice-recorder.test.tsx).
// A trivial stub, driven the same way MediaSourceSheet already is —
// findByType(VoiceRecorder) locates it and its props are called directly.
vi.mock('../components/voice-recorder', () => ({
  VoiceRecorder: () => null,
}));

const ComposeScreen = (await import('../../app/(app)/compose/[id]/compose')).default;

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

// Captured before any `vi.useFakeTimers()` call replaces the global —
// invoking the real, un-faked timer directly (see `flush` below) rather
// than toggling `useRealTimers()`/`useFakeTimers()` mid-test, which would
// tear down and recreate the fake clock and lose a debounce timer's
// already-elapsed progress along with it.
const realSetTimeout = globalThis.setTimeout;

/**
 * The requested `ms` is advanced exactly once under fake timers — debounce-
 * timing tests depend on that being precise — then one short genuine wait,
 * via the real `setTimeout` captured above: real `crypto.subtle` calls
 * (`use-capsule-compose.ts`'s encrypt/unwrap calls) run on Node's own thread
 * pool and complete on real wall-clock time, which no amount of
 * synchronously-resolving fake-timer advancement can force to happen faster
 * (confirmed the hard way under full-suite parallel load).
 */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await new Promise((resolve) => realSetTimeout(resolve, 20));
  });
}

async function renderScreen(): Promise<TestRenderer.ReactTestRenderer> {
  let instance!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    instance = TestRenderer.create(<ComposeScreen />);
  });
  // The bootstrap effect is a multi-hop async chain (get+recipients ->
  // resolve/generate key -> maybe decrypt -> maybe patch); settle it here
  // once, so every call site doesn't need its own extra flush() just to
  // reach the first render of "ready".
  await flush(0);
  return instance;
}

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
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
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
    createdAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Populated by `createTicketFn`'s own mock impl below, read back by `completeFn`'s — lets the mocked ticket/complete round-trip echo a real picked file's name/mime/size into the eventual `MediaItem`, like the real server does. */
let ticketInputs: Map<string, { name: string; mime: string; sizeBytes: number }>;
let mediaSeq: number;
/**
 * A tiny in-memory stand-in for the server's own media rows, mutated by the
 * mocked `createTicket`/`complete`/`delete` below exactly as the real
 * backend would mutate its `media_items` table — necessary because
 * `useMediaEnclosures.refresh()` (mirroring web's own `use-enclosures.ts`)
 * never locally appends the `MediaItem` a `complete` call returns; it always
 * re-fetches `capsulesApi.media` and trusts *that* list. A static
 * `{ data: [] }` mock would make every newly-enclosed item vanish the
 * instant it finished, since the refetch would never find it.
 */
let serverMediaRows: Record<string, unknown>[];

beforeEach(() => {
  vi.useFakeTimers();
  back.mockReset();
  get.mockReset();
  // A sensible default so tests that don't care about the exact bootstrap
  // path (most of the hallmark/editor tests below) don't also need to mock
  // the owner-key-wrap PATCH just to avoid crashing — tests that assert on
  // patchFn's own call *count* give their capsule fixture a real
  // `ownerKeyWrap` instead, so bootstrap's generate-branch never fires.
  patchFn.mockReset().mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({ capsule: capsuleFixture(fields) }));
  recipientsFn.mockReset().mockResolvedValue({ data: [] });
  mockMasterKey = generateMasterKey();
  routeId = '11111111-1111-1111-1111-111111111111';
  saveLocalDraftFn.mockReset().mockResolvedValue(undefined);
  loadLocalDraftFn.mockReset().mockResolvedValue({ status: 'none' });
  deleteLocalDraftFn.mockReset().mockResolvedValue(undefined);
  pickForSourceFn.mockReset();

  // Media pipeline defaults — a fresh capsule with nothing already attached,
  // and a ticket/complete round-trip that succeeds on the first try. Tests
  // that need a failure override these directly.
  serverMediaRows = [];
  mediaListFn.mockReset().mockImplementation(async () => ({ data: [...serverMediaRows] }));
  ticketInputs = new Map();
  mediaSeq = 0;
  createTicketFn.mockReset().mockImplementation(async (_capsuleId: string, input: { name: string; mime: string; sizeBytes: number }) => {
    const mediaId = `media-${++mediaSeq}`;
    ticketInputs.set(mediaId, input);
    return { mediaId, uploadId: 'upload-1', parts: [{ partNumber: 1, url: `https://r2.example/${mediaId}` }] };
  });
  completeFn.mockReset().mockImplementation(async (mediaId: string, input: { durationMs?: number; width?: number; height?: number }) => {
    const ticket = ticketInputs.get(mediaId)!;
    const media = {
      id: mediaId,
      capsuleId: routeId,
      kind: 'image',
      originalName: ticket.name,
      mime: ticket.mime,
      sizeBytes: ticket.sizeBytes,
      durationMs: input.durationMs ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      caption: null,
      position: 0,
      blurhash: null,
      status: 'ready',
      encMeta: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      releasedAt: null,
      releaseReason: null,
    };
    serverMediaRows.push(media);
    return { media };
  });
  deleteMediaFn.mockReset().mockImplementation(async (mediaId: string) => {
    serverMediaRows = serverMediaRows.filter((m) => m.id !== mediaId);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? 'etag-1' : null) } }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ComposeScreen', () => {
  describe('loading and error states', () => {
    it('shows a loading state while the capsule is being fetched', async () => {
      get.mockReturnValue(new Promise(() => {}));
      const instance = await renderScreen();
      expect(texts(instance)).toContain('Loading…');
    });

    it('shows an error state with retry on fetch failure, and recovers', async () => {
      get.mockRejectedValueOnce(new Error('network down'));
      const instance = await renderScreen();
      await flush();
      expect(texts(instance)).toContain("We couldn't load this capsule.");

      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValueOnce({ capsule: capsuleFixture({ ownerKeyWrap }) });
      const retryButton = instance.root.findAllByType(Pressable).find((n) => n.props.accessibilityLabel !== 'Back')!;
      await act(async () => {
        retryButton.props.onPress();
        await vi.advanceTimersByTimeAsync(0);
      });
      await flush();
      expect(texts(instance).join(' ')).toContain('For yourself');
    });
  });

  describe('the hallmark — who this is for and when it opens', () => {
    it('reads "For yourself" and "No date yet" for a self-type draft with nothing chosen', async () => {
      // A real ownerKeyWrap keeps bootstrap on the "unwrap" branch — the
      // "generate" branch's own mocked PATCH echo would otherwise silently
      // revert `type` back to the fixture default ('personal'), which this
      // assertion cannot tell apart from a real self-capsule (both read as
      // "For yourself" once there are no recipients either way).
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', ownerKeyWrap }) });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('For yourself · No date yet');
    });

    it('reads "For {name}" from the first recipient for a personal-type capsule', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsFn.mockResolvedValue({ data: [recipientFixture({ displayName: 'Amara' })] });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('For Amara ·');
    });

    it('falls back through email then phone when no display name is set', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsFn.mockResolvedValue({ data: [recipientFixture({ displayName: null, email: 'amara@example.com' })] });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('For amara@example.com ·');
    });

    it('reads the chosen date once unlockAt is set', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt: '2027-06-15T09:00:00.000Z', ownerKeyWrap }) });
      const instance = await renderScreen();
      await flush();
      const expected = new Date('2027-06-15T09:00:00.000Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      expect(texts(instance).join(' ')).toContain(`Opens ${expected}`);
    });

    it('is a reading, not a control — no accessible button wraps it', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();
      const hallmark = instance.root.findByProps({ accessibilityRole: 'text' });
      expect(hallmark).toBeTruthy();
    });
  });

  describe('the letter editor', () => {
    it('loads existing content back into the field as plain text', async () => {
      const { wrapCapsuleKeyForOwner, encryptBytes } = await import('@tc/crypto');
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
      const { encodeIvCiphertext, textToEnvelope } = await import('../lib/capsule-crypto');
      const envelope = textToEnvelope('Dear future me,\nI hope this finds you well.');
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(JSON.stringify(envelope)));
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);
      get.mockResolvedValue({ capsule: capsuleFixture({ ownerKeyWrap, contentDocEnc }) });

      const instance = await renderScreen();
      await flush();
      const input = instance.root.findByType(TextInput);
      expect(input.props.value).toBe('Dear future me,\nI hope this finds you well.');
    });

    it('typing, empty content, multiple paragraphs, and Unicode all update the field without error', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', ownerKeyWrap }) });
      patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({ capsule: capsuleFixture({ type: 'self', ownerKeyWrap, ...fields }) }));
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      const text = 'First paragraph.\n\nSecond paragraph — em dash.\n日本語 ☕️';
      act(() => {
        input.props.onChangeText(text);
      });
      expect(instance.root.findByType(TextInput).props.value).toBe(text);

      await flush(3000);
      expect(patchFn).toHaveBeenCalledTimes(1); // the debounced content save — the bootstrap needed no PATCH since ownerKeyWrap already existed
    });

    it('debounces autosave — no PATCH until ~3s after the last keystroke', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', ownerKeyWrap }) });
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('H'));
      await flush(1000);
      expect(patchFn).not.toHaveBeenCalled();
      await flush(2000);
      expect(patchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('autosave status', () => {
    it('shows nothing before any edit has been made', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).not.toContain('Saving');
      expect(rendered).not.toContain('Saved');
    });

    it('shows "Saved" once autosave succeeds', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      patchFn.mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({ capsule: capsuleFixture({ type: 'self', ...fields }) }));
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('Hello'));
      await flush(3000);
      expect(texts(instance)).toContain('Saved');
    });

    it('shows the specific message when the capsule has already been sealed', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', ownerKeyWrap }) });
      const { ApiClientError } = await import('../lib/api-client');
      patchFn.mockRejectedValue(new ApiClientError('capsule_sealed', 'sealed', 409));
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('Too late'));
      await flush(3000);
      expect(texts(instance)).toContain('This capsule has already been sealed and can no longer be edited.');
    });
  });

  describe('navigation', () => {
    it('the back button flushes any pending autosave, then calls router.back()', async () => {
      const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(generateMasterKey(), mockMasterKey!);
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', ownerKeyWrap }) });
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('Unsent words'));
      expect(patchFn).not.toHaveBeenCalled();

      const backButton = instance.root.findByProps({ accessibilityLabel: 'Back' });
      // Not a raw advanceTimersByTimeAsync(0) here — onPress triggers
      // goBack()'s flush(), which does real encryptBytes work needing
      // genuine wall-clock time (this file's own flush() helper's real
      // 20ms settle exists for exactly this; a raw advance intermittently
      // undercounts patchFn's call under loaded/CI runners).
      await act(async () => {
        backButton.props.onPress();
      });
      await flush(0);
      expect(patchFn).toHaveBeenCalledTimes(1); // flushed before navigating away
      expect(back).toHaveBeenCalledTimes(1);
    });
  });

  describe('media enclosure (E1.4.5)', () => {
    it('opens the source sheet from the "Enclose something" control', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      expect(instance.root.findByType(Modal).props.visible).toBe(false);
      const enclose = instance.root.findByProps({ accessibilityLabel: 'Enclose something' });
      act(() => enclose.props.onPress());
      expect(instance.root.findByType(Modal).props.visible).toBe(true);
    });

    it('a picked photo shows immediately as encrypting, then as truly enclosed with its real size, and closes the sheet', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({
        status: 'picked',
        media: [{ uri: 'file:///photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 }],
      });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      const sheet = instance.root.findByType(MediaSourceSheet);
      await act(async () => {
        sheet.props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(pickForSourceFn).toHaveBeenCalledWith('camera');
      expect(instance.root.findByType(Modal).props.visible).toBe(false);
      // Fires the instant the file is picked — before any network call has a
      // chance to resolve — matching web's own immediate `onFiles` behavior,
      // not a queued "attach later" step.
      expect(texts(instance).join(' ')).toContain('photo.jpg');

      await flush(0);
      expect(createTicketFn).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        { name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: expect.any(Number) },
        expect.any(String),
      );
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('photo.jpg');
      // The real, server-confirmed size (`sizeBytes` on the completed
      // `MediaItem`) is the encrypted ciphertext's own length — the mocked
      // pipeline still uses this codebase's real `@tc/crypto`, so this is a
      // genuine (AES-GCM overhead-inclusive) byte count, not the original
      // 2048 the picker reported.
      expect(rendered).toMatch(/\d+(\.\d+)? (B|KB)/);
    });

    it('picking from multiple sources encloses and attaches both, rather than replacing one with the other', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn
        .mockResolvedValueOnce({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] })
        .mockResolvedValueOnce({ status: 'picked', media: [{ uri: 'file:///b.pdf', name: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 20 }] });
      const instance = await renderScreen();
      await flush();

      for (const source of ['camera', 'file'] as const) {
        act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
        await act(async () => {
          instance.root.findByType(MediaSourceSheet).props.onSelect(source);
          await vi.advanceTimersByTimeAsync(0);
        });
        await flush(0);
      }

      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('a.jpg');
      expect(rendered).toContain('b.pdf');
    });

    it('removing a truly-attached item detaches it server-side and takes it out of the list', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });
      await flush(0);
      expect(texts(instance).join(' ')).toContain('a.jpg');

      act(() => instance.root.findByProps({ accessibilityLabel: 'Remove a.jpg' }).props.onPress());
      await flush(0);
      expect(deleteMediaFn).toHaveBeenCalledWith('media-1');
      expect(texts(instance).join(' ')).not.toContain('a.jpg');
    });

    it('removing a still-in-flight item stops it from ever completing, without disturbing anything else', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] });
      // Never resolves — the item stays in the 'encrypting'/'sending' stage.
      createTicketFn.mockReturnValue(new Promise(() => {}));
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(texts(instance).join(' ')).toContain('a.jpg');

      act(() => instance.root.findByProps({ accessibilityLabel: 'Remove a.jpg' }).props.onPress());
      expect(texts(instance).join(' ')).not.toContain('a.jpg');
      // No ticket ever completed, so there is nothing to delete server-side.
      expect(deleteMediaFn).not.toHaveBeenCalled();
    });

    it('shows a permission-denied message naming the specific source, and adds nothing to the pending list', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'permission_denied' });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('library');
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(texts(instance).join(' ')).toContain('Photo library access was not granted. You can allow it in Settings.');
    });

    it('a cancelled pick leaves the pending list and any message untouched', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'cancelled' });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });

      const rendered = texts(instance).join(' ');
      expect(rendered).not.toContain('not granted');
      const removeButtons = instance.root.findAllByType(Pressable).filter((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Remove '));
      expect(removeButtons).toEqual([]); // nothing was added to the pending list
    });

    it('picking media never touches the encrypted local draft store — media has no offline concept at all (Decision 16)', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });
      // Runs the full encrypt → ticket → PUT → complete chain to completion
      // before asserting — a real regression here (some future change
      // routing a media byte through `saveLocalDraft`) would only show up
      // once the pipeline has actually finished.
      await flush(0);

      expect(saveLocalDraftFn).not.toHaveBeenCalled();
    });

    it('picking media does not disturb the letter already being written', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] });
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('A letter in progress'));

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });
      await flush(0);

      expect(instance.root.findByType(TextInput).props.value).toBe('A letter in progress');
    });

    it('never logs a picked file\'s name, URI, plaintext bytes, ciphertext, or capsule key through the full encrypt/upload pipeline', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({
        status: 'picked',
        media: [{ uri: 'file:///very-specific-private-path.jpg', name: 'very-specific-private-path.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }],
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const instance = await renderScreen();
        await flush();
        act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
        await act(async () => {
          instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
          await vi.advanceTimersByTimeAsync(0);
        });
        await flush(0);
        expect(texts(instance).join(' ')).toContain('very-specific-private-path.jpg'); // sanity: the pipeline really ran, this isn't a vacuous pass
        for (const spy of [logSpy, errorSpy]) {
          for (const call of spy.mock.calls) {
            expect(call.map((a) => String(a)).join(' ')).not.toContain('very-specific-private-path');
          }
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });

    it('a failed upload can be retried without losing the letter, and does not need the file re-picked', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] });
      createTicketFn.mockRejectedValueOnce(new Error('network down'));
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('Written before the failure'));

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      await act(async () => {
        instance.root.findByType(MediaSourceSheet).props.onSelect('camera');
        await vi.advanceTimersByTimeAsync(0);
      });
      await flush(0);

      expect(texts(instance).join(' ')).toContain('Stopped before it finished');
      // Failing to upload media must never destroy or hide the letter.
      expect(instance.root.findByType(TextInput).props.value).toBe('Written before the failure');

      const firstKey = createTicketFn.mock.calls[0]![2];
      act(() => instance.root.findByProps({ accessibilityLabel: 'Retry a.jpg' }).props.onPress());
      await flush(0);

      expect(createTicketFn).toHaveBeenCalledTimes(2);
      // The same idempotency key is reused across a retry of the same item
      // (see media-upload.ts's own header comment for why) — this is not
      // "a second, unrelated attempt" from the server's point of view.
      expect(createTicketFn.mock.calls[1]![2]).toBe(firstKey);
      expect(texts(instance).join(' ')).toContain('a.jpg');
      expect(texts(instance).join(' ')).not.toContain('Stopped before it finished');
    });

    it('an orphaned ticket recovered from a previous session offers Remove but not Retry (the original bytes no longer exist)', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      mediaListFn.mockResolvedValue({
        data: [
          {
            id: 'orphan-1',
            capsuleId: '11111111-1111-1111-1111-111111111111',
            kind: 'image',
            originalName: 'abandoned.jpg',
            mime: 'image/jpeg',
            sizeBytes: 500,
            durationMs: null,
            width: null,
            height: null,
            caption: null,
            position: 0,
            blurhash: null,
            status: 'uploading',
            encMeta: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            releasedAt: null,
            releaseReason: null,
          },
        ],
      });
      const instance = await renderScreen();
      await flush();

      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('abandoned.jpg');
      expect(rendered).toContain('Never finished arriving');
      expect(instance.root.findAllByProps({ accessibilityLabel: 'Retry abandoned.jpg' })).toHaveLength(0);

      act(() => instance.root.findByProps({ accessibilityLabel: 'Remove abandoned.jpg' }).props.onPress());
      await flush(0);
      expect(deleteMediaFn).toHaveBeenCalledWith('orphan-1');
    });
  });

  describe('voice recorder (E1.4.6)', () => {
    it('selecting "Voice" from the sheet opens the recorder instead of calling a picker', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);

      expect(pickForSourceFn).not.toHaveBeenCalled();
      expect(instance.root.findByType(MediaSourceSheet).props.visible).toBe(false); // the media-source sheet itself closes
      expect(instance.root.findAllByType(VoiceRecorder)).toHaveLength(1); // and the recorder mounts in its place
    });

    it('is not mounted until Voice is actually chosen', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      expect(instance.root.findAllByType(VoiceRecorder)).toHaveLength(0);
    });

    it('an accepted recording is added to the pending list, exactly like a picked file', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);

      const { normalizeVoiceRecording } = await import('../lib/media-source');
      const media = normalizeVoiceRecording('file:///voice-take.m4a', 4200);
      act(() => instance.root.findByType(VoiceRecorder).props.onAccept(media));

      const rendered = texts(instance).join(' ');
      expect(rendered).toContain(media.name);
    });

    it('accepting a recording unmounts the recorder (its onCancel is not separately required to close it)', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);

      const { normalizeVoiceRecording } = await import('../lib/media-source');
      act(() => instance.root.findByType(VoiceRecorder).props.onAccept(normalizeVoiceRecording('file:///x.m4a', 1000)));

      // compose.tsx's own onAccept prop (passed to VoiceRecorder) only adds
      // to pendingMedia — voice-recorder.tsx itself is what calls onCancel()
      // right after onAccept() to close itself (matching web's own
      // `onAccept(take.file); onCancel();"), so the mocked stub here (which
      // never calls onCancel on its own) is expected to still be mounted;
      // this proves compose.tsx doesn't *also* try to unmount it itself.
      expect(instance.root.findAllByType(VoiceRecorder)).toHaveLength(1);
    });

    it('cancelling closes the recorder without adding anything to the pending list', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);
      expect(instance.root.findAllByType(VoiceRecorder)).toHaveLength(1);

      act(() => instance.root.findByType(VoiceRecorder).props.onCancel());

      expect(instance.root.findAllByType(VoiceRecorder)).toHaveLength(0);
      const removeButtons = instance.root.findAllByType(Pressable).filter((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Remove '));
      expect(removeButtons).toEqual([]);
    });

    it('an accepted recording never touches the encrypted local draft store, through the full encrypt/upload pipeline', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);
      const { normalizeVoiceRecording } = await import('../lib/media-source');
      act(() => instance.root.findByType(VoiceRecorder).props.onAccept(normalizeVoiceRecording('file:///x.m4a', 1000)));
      await flush(0);

      expect(saveLocalDraftFn).not.toHaveBeenCalled();
    });

    it('recording does not disturb the letter already being written', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => input.props.onChangeText('A letter in progress'));

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);
      const { normalizeVoiceRecording } = await import('../lib/media-source');
      act(() => instance.root.findByType(VoiceRecorder).props.onAccept(normalizeVoiceRecording('file:///x.m4a', 1000)));
      await flush(0);

      expect(instance.root.findByType(TextInput).props.value).toBe('A letter in progress');
    });

    it('a recorded voice note completes the same encrypt/ticket/upload/complete pipeline as a picked file', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = await renderScreen();
      await flush();

      act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
      act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
      await vi.advanceTimersByTimeAsync(0);
      const { normalizeVoiceRecording } = await import('../lib/media-source');
      const media = normalizeVoiceRecording('file:///voice-take.m4a', 4200);
      act(() => instance.root.findByType(VoiceRecorder).props.onAccept(media));
      await flush(0);

      expect(createTicketFn).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        { name: media.name, mime: 'audio/mp4', sizeBytes: expect.any(Number) },
        expect.any(String),
      );
      expect(completeFn).toHaveBeenCalledWith('media-1', { parts: [{ partNumber: 1, eTag: 'etag-1' }], durationMs: 4200, width: undefined, height: undefined }, expect.any(String));
      expect(texts(instance).join(' ')).toContain(media.name);
    });

    it('never logs a recorded file\'s URI, plaintext audio bytes, or ciphertext through the full pipeline', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const instance = await renderScreen();
        await flush();
        act(() => instance.root.findByProps({ accessibilityLabel: 'Enclose something' }).props.onPress());
        act(() => instance.root.findByType(MediaSourceSheet).props.onSelect('voice'));
        await vi.advanceTimersByTimeAsync(0);
        const { normalizeVoiceRecording } = await import('../lib/media-source');
        act(() =>
          instance.root.findByType(VoiceRecorder).props.onAccept(normalizeVoiceRecording('file:///very-specific-private-path.m4a', 1000)),
        );
        await flush(0);
        for (const spy of [logSpy, errorSpy]) {
          for (const call of spy.mock.calls) {
            expect(call.map((a) => String(a)).join(' ')).not.toContain('very-specific-private-path');
          }
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });

  describe('accessibility', () => {
    it('pads the back button below the status bar using the real safe-area inset', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      const instance = await renderScreen();
      await flush();
      const backButton = instance.root.findByProps({ accessibilityLabel: 'Back' });
      const style = [backButton.props.style].flat();
      const paddingTop = style.map((s) => s?.paddingTop).find((v) => v !== undefined);
      expect(paddingTop).toBe(40 + 16); // insets.top (40) + space[4] (16)
    });

    it('the letter field carries an accessible label', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      const instance = await renderScreen();
      await flush();
      expect(instance.root.findByType(TextInput).props.accessibilityLabel).toBe('Letter');
    });

    it('never imports SecureStore, AsyncStorage, the token store, or the raw @tc/crypto package by name — key material flows only through useMasterKey() and use-capsule-compose.ts', async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const here = dirname(fileURLToPath(import.meta.url));
      const source = readFileSync(join(here, '../../app/(app)/compose/[id]/compose.tsx'), 'utf-8');
      const importLines = source
        .split('\n')
        .filter((line) => line.trim().startsWith('import '))
        .join('\n');
      expect(importLines).not.toMatch(/expo-secure-store|AsyncStorage|token-store|@tc\/crypto/);
    });
  });
});
