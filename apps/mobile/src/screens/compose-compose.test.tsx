import type { Capsule, Recipient } from '@tc/contracts';
import { generateMasterKey } from '@tc/crypto';
import { act } from 'react';
import { Modal, Pressable, Text, TextInput } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaSourceSheet } from '../components/media-source-sheet';

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
vi.mock('../lib/api-client', () => ({
  capsulesApi: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patchFn(...args),
    recipients: (...args: unknown[]) => recipientsFn(...args),
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
});

afterEach(() => {
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

    it('a picked photo appears in the pending list, with its size, and closes the sheet', async () => {
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
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('photo.jpg');
      expect(rendered).toContain('2 KB');
    });

    it('picking from multiple sources accumulates entries rather than replacing the list', async () => {
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
      }

      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('a.jpg');
      expect(rendered).toContain('b.pdf');
    });

    it('removing a pending item takes it out of the list', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      pickForSourceFn.mockResolvedValue({ status: 'picked', media: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }] });
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

      expect(instance.root.findByType(TextInput).props.value).toBe('A letter in progress');
    });

    it('never logs a picked file\'s name or URI', async () => {
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
