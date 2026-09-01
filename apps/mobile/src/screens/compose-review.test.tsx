import type { Capsule, MediaItem, Recipient } from '@tc/contracts';
import { generateMasterKey } from '@tc/crypto';
import { act } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
}));

const back = vi.fn();
const push = vi.fn();
const replace = vi.fn();
let routeId = '11111111-1111-1111-1111-111111111111';
const router = { back, push, replace };
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
const sealFn = vi.fn();
vi.mock('../lib/api-client', () => ({
  capsulesApi: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patchFn(...args),
    recipients: (...args: unknown[]) => recipientsFn(...args),
    media: (...args: unknown[]) => mediaListFn(...args),
    seal: (...args: unknown[]) => sealFn(...args),
  },
  mediaApi: {
    delete: vi.fn(),
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

// expo-file-system is a native module with no JS-only fallback — pulled in
// transitively via media-upload.ts's randomIdempotencyKey (this screen never
// actually reads a file, but the import chain still needs a stub to load;
// same reasoning as compose-compose.test.tsx's own identical mock).
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

// Stable reference — see compose-compose.test.tsx's own note on why a fresh
// literal per render is a real bug pattern this Stage E arc has hit before.
const mockUser = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Boundary-mocked exactly like compose-compose.test.tsx — this file's tests
// are about the Review screen's own wiring, not local-draft-store.ts's real
// SQLite/crypto behavior (its own dedicated test file covers that). Review
// never edits, but useCapsuleCompose's bootstrap effect still calls
// loadLocalDraft unconditionally on mount.
const saveLocalDraftFn = vi.fn();
const loadLocalDraftFn = vi.fn().mockResolvedValue({ status: 'none' });
const deleteLocalDraftFn = vi.fn();
vi.mock('../lib/local-draft-store', () => ({
  saveLocalDraft: (...args: unknown[]) => saveLocalDraftFn(...args),
  loadLocalDraft: (...args: unknown[]) => loadLocalDraftFn(...args),
  deleteLocalDraft: (...args: unknown[]) => deleteLocalDraftFn(...args),
}));

const ReviewScreen = (await import('../../app/(app)/compose/[id]/review')).default;

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

const realSetTimeout = globalThis.setTimeout;

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
    instance = TestRenderer.create(<ReviewScreen />);
  });
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
    unlockAt: '2027-06-15T09:00:00.000Z',
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

function mediaFixture(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    capsuleId: '11111111-1111-1111-1111-111111111111',
    kind: 'image',
    originalName: 'photo.jpg',
    mime: 'image/jpeg',
    sizeBytes: 2048,
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

/** A ready capsule with a real, already-set owner key wrap — keeps bootstrap on the "unwrap" branch, never the "generate" one, which is the only branch that ever calls patch(). */
async function readyCapsule(overrides: Partial<Capsule> = {}): Promise<{ capsule: Capsule; capsuleKey: Uint8Array }> {
  const { wrapCapsuleKeyForOwner } = await import('@tc/crypto');
  const capsuleKey = generateMasterKey();
  const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, mockMasterKey!);
  return { capsule: capsuleFixture({ ownerKeyWrap, ...overrides }), capsuleKey };
}

async function withLetter(capsuleKey: Uint8Array, capsule: Capsule, text: string): Promise<Capsule> {
  const { encryptBytes } = await import('@tc/crypto');
  const { encodeIvCiphertext, textToEnvelope } = await import('../lib/capsule-crypto');
  const envelope = textToEnvelope(text);
  const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(JSON.stringify(envelope)));
  return { ...capsule, contentDocEnc: encodeIvCiphertext(iv, ciphertext) };
}

beforeEach(() => {
  vi.useFakeTimers();
  back.mockReset();
  push.mockReset();
  replace.mockReset();
  get.mockReset();
  patchFn.mockReset().mockImplementation(async (_id: string, fields: Record<string, unknown>) => ({ capsule: capsuleFixture(fields) }));
  recipientsFn.mockReset().mockResolvedValue({ data: [] });
  mediaListFn.mockReset().mockResolvedValue({ data: [] });
  sealFn.mockReset();
  mockMasterKey = generateMasterKey();
  routeId = '11111111-1111-1111-1111-111111111111';
  saveLocalDraftFn.mockReset().mockResolvedValue(undefined);
  loadLocalDraftFn.mockReset().mockResolvedValue({ status: 'none' });
  deleteLocalDraftFn.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ReviewScreen', () => {
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

      const { capsule } = await readyCapsule();
      get.mockResolvedValueOnce({ capsule });
      const retryButton = instance.root.findAllByType(Pressable).find((n) => n.props.accessibilityLabel !== 'Back')!;
      await act(async () => {
        retryButton.props.onPress();
        await vi.advanceTimersByTimeAsync(0);
      });
      await flush();
      expect(texts(instance).join(' ')).toContain('For yourself');
    });
  });

  describe('the record — who, when, and the letter itself', () => {
    it('reads "For yourself" for a self-type capsule with no recipient', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('For yourself');
    });

    it('reads "For {name}" from the first recipient for a personal-type capsule', async () => {
      const { capsule } = await readyCapsule({ type: 'personal' });
      get.mockResolvedValue({ capsule });
      recipientsFn.mockResolvedValue({ data: [recipientFixture({ displayName: 'Amara' })] });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('For Amara');
    });

    it('shows the exact opening date and time chosen in Address', async () => {
      const { capsule } = await readyCapsule({ type: 'self', unlockAt: '2027-06-15T09:00:00.000Z' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      const expected = new Date('2027-06-15T09:00:00.000Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Opens');
      expect(rendered).toContain(expected);
    });

    it('renders the real letter paragraphs, exactly as written', async () => {
      const { capsule, capsuleKey } = await readyCapsule({ type: 'self' });
      const withText = await withLetter(capsuleKey, capsule, 'Dear future me,\n\nI hope this finds you well.');
      get.mockResolvedValue({ capsule: withText });
      const instance = await renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Dear future me,');
      expect(rendered).toContain('I hope this finds you well.');
    });

    it('shows a placeholder when nothing has been written', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance)).toContain('Nothing written yet.');
    });

    it('lists enclosed media by name, with a kind-specific glyph — never decrypted, never previewed', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      mediaListFn.mockResolvedValue({
        data: [mediaFixture({ id: 'media-1', kind: 'audio', originalName: 'voice-note.m4a' }), mediaFixture({ id: 'media-2', kind: 'video', originalName: 'clip.mov' })],
      });
      const instance = await renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('voice-note.m4a');
      expect(rendered).toContain('♪');
      expect(rendered).toContain('clip.mov');
      expect(rendered).toContain('▤');
    });

    it('states the capsule is irreversible once sealed, in plain language, without a checkbox or dialog', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('Once sealed, what is inside cannot be changed.');
    });
  });

  describe('key, content, and state preservation — this screen never mutates anything', () => {
    it('never calls patch — Review only reads, it never edits or re-persists content', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      await renderScreen();
      await flush();
      expect(patchFn).not.toHaveBeenCalled();
    });

    it('never generates a second capsule key — the same already-set ownerKeyWrap is simply re-unwrapped', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      await renderScreen();
      await flush();
      // The only call that could ever persist a newly generated key is
      // patch() (see use-capsule-compose.ts's own "generate" bootstrap
      // branch) — asserting it is never called is a direct proof no second
      // key was ever created, not merely an inference from "looks correct".
      expect(patchFn).not.toHaveBeenCalled();
    });

    it('fetches the same capsule/recipients/media again on every mount rather than relying on navigation params, so back-and-return always reflects the true current state', async () => {
      const { capsule } = await readyCapsule({ type: 'personal', unlockAt: '2027-06-15T09:00:00.000Z' });
      get.mockResolvedValue({ capsule });
      recipientsFn.mockResolvedValue({ data: [recipientFixture({ displayName: 'Amara' })] });
      await renderScreen();
      await flush();
      expect(get).toHaveBeenCalledWith(routeId);
      expect(recipientsFn).toHaveBeenCalledWith(routeId);
      expect(mediaListFn).toHaveBeenCalledWith(routeId);
    });
  });

  describe('sealing', () => {
    it('seals with exactly the capsule id and an idempotency key, and no request body at all', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      sealFn.mockResolvedValue({ capsule: { ...capsule, state: 'sealed' } });
      const instance = await renderScreen();
      await flush();

      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      await act(async () => {
        sealButton.props.onPress();
      });
      await flush(0);

      expect(sealFn).toHaveBeenCalledTimes(1);
      const args = sealFn.mock.calls[0]!;
      expect(args[0]).toBe(routeId);
      expect(typeof args[1]).toBe('string');
      expect(args[1].length).toBeGreaterThan(0);
      // No cryptographic artifact (capsule key, wrap, ciphertext) is ever the
      // third argument — the seal call carries only an id and an idempotency
      // key, matching the bodyless `POST /capsules/:id/seal` contract.
      expect(args).toHaveLength(2);
    });

    it('reuses the same idempotency key across repeated taps rather than minting a new one per attempt', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      sealFn.mockRejectedValueOnce(new Error('network down'));
      sealFn.mockResolvedValueOnce({ capsule: { ...capsule, state: 'sealed' } });
      const instance = await renderScreen();
      await flush();

      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      await act(async () => {
        sealButton.props.onPress();
      });
      await flush(0);

      const retryButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      await act(async () => {
        retryButton.props.onPress();
      });
      await flush(0);

      expect(sealFn).toHaveBeenCalledTimes(2);
      expect(sealFn.mock.calls[0]![1]).toBe(sealFn.mock.calls[1]![1]);
    });

    it('navigates to home on a successful seal, replacing the stack rather than pushing', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      sealFn.mockResolvedValue({ capsule: { ...capsule, state: 'sealed' } });
      const instance = await renderScreen();
      await flush();

      await act(async () => {
        instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.onPress();
      });
      await flush(0);

      expect(replace).toHaveBeenCalledWith('/(app)/(tabs)/home');
      expect(push).not.toHaveBeenCalled();
    });

    it('disables the seal button and shows a busy state while sealing — preventing a double submit', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      let resolveSeal!: (v: { capsule: Capsule }) => void;
      sealFn.mockReturnValue(new Promise((resolve) => (resolveSeal = resolve)));
      const instance = await renderScreen();
      await flush();

      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      act(() => {
        sealButton.props.onPress();
      });
      await flush(0);

      const busyButton = instance.root.findByProps({ accessibilityLabel: 'Sealing…' });
      expect(busyButton.props.disabled).toBe(true);
      expect(busyButton.props.accessibilityState.busy).toBe(true);
      expect(instance.root.findAllByType(ActivityIndicator)).toHaveLength(1);

      // A second tap while sealing must not fire a second request — there is
      // no enabled button to tap at all (disabled === true, asserted above),
      // so this only confirms sealFn was never invoked twice regardless.
      resolveSeal({ capsule: { ...capsule, state: 'sealed' } });
      await flush(0);
      expect(sealFn).toHaveBeenCalledTimes(1);
    });

    it('a network failure shows a retryable message and leaves the draft fully intact — nothing is destroyed', async () => {
      const { capsule, capsuleKey } = await readyCapsule({ type: 'self' });
      const withText = await withLetter(capsuleKey, capsule, 'A letter that must survive a failed seal.');
      get.mockResolvedValue({ capsule: withText });
      sealFn.mockRejectedValue(new Error('Could not reach the server.'));
      const instance = await renderScreen();
      await flush();

      await act(async () => {
        instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.onPress();
      });
      await flush(0);

      expect(replace).not.toHaveBeenCalled();
      expect(texts(instance).join(' ')).toContain('A letter that must survive a failed seal.');
      // The seal button is enabled again — this really was a retryable failure, not a stuck state.
      expect(instance.root.findByProps({ accessibilityLabel: 'Seal capsule' })).toBeTruthy();
    });

    it('an already-sealed response is shown as non-retryable, with no "Go to Address" action', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const { ApiClientError } = await import('../lib/api-client');
      sealFn.mockRejectedValue(new ApiClientError('capsule_sealed', 'This capsule is already sealed.', 409));
      const instance = await renderScreen();
      await flush();

      await act(async () => {
        instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.onPress();
      });
      await flush(0);

      expect(texts(instance).join(' ')).toContain('This capsule is already sealed. Nothing further is needed.');
      expect(instance.root.findAllByProps({ accessibilityLabel: 'Go to Address' })).toHaveLength(0);
      // Non-retryable — the seal control stays disabled rather than inviting another tap.
      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      expect(sealButton.props.disabled).toBe(true);
    });

    it('a validation failure (unlock moment now in the past) sends the writer back to Address, and back there unmodified', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const { ApiClientError } = await import('../lib/api-client');
      sealFn.mockRejectedValue(new ApiClientError('unlock_in_past', 'The moment has passed.', 409));
      const instance = await renderScreen();
      await flush();

      await act(async () => {
        instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.onPress();
      });
      await flush(0);

      const goToAddress = instance.root.findByProps({ accessibilityLabel: 'Go to Address' });
      act(() => goToAddress.props.onPress());
      expect(push).toHaveBeenCalledWith(`/(app)/compose/${routeId}/address`);
    });

    it('a schedule already in the past (detected client-side, before any seal attempt) disables sealing and offers to choose a new moment', async () => {
      const { capsule } = await readyCapsule({ type: 'self', unlockAt: '2020-01-01T00:00:00.000Z' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();

      expect(texts(instance).join(' ')).toMatch(/moment.*passed|Choose a new one/i);
      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      expect(sealButton.props.disabled).toBe(true);
      expect(sealFn).not.toHaveBeenCalled();

      const chooseNew = instance.root.findByProps({ accessibilityLabel: 'Choose a new moment' });
      act(() => chooseNew.props.onPress());
      expect(push).toHaveBeenCalledWith(`/(app)/compose/${routeId}/address`);
    });

    it('an item that never finished arriving (recovered as an orphaned row) does not block sealing client-side — the server 409 is the real enforcement', async () => {
      // Review re-derives its media list fresh from the server on every
      // mount (per-screen architecture — see use-media-enclosures.ts's own
      // `refresh()`); an item still `status: 'uploading'` from a previous
      // session comes back as an orphaned, already-`failed` pending row
      // (never a live in-flight one, since nothing on this screen ever
      // calls `enclose()`), so it is one `enclosuresInFlight` deliberately
      // does not count — matching web's own `pending.filter(p => p.stage
      // !== 'failed').length` exactly. Real enforcement is the server's
      // `upload_incomplete` 409, asserted separately below.
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      mediaListFn.mockResolvedValue({ data: [mediaFixture({ id: 'media-1', status: 'uploading', originalName: 'still-going.jpg' })] });
      const instance = await renderScreen();
      await flush();

      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      expect(sealButton.props.disabled).toBe(false);
    });

    it('the server rejecting a seal as upload_incomplete is shown as a retryable message, without destroying the draft', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const { ApiClientError } = await import('../lib/api-client');
      sealFn.mockRejectedValue(new ApiClientError('upload_incomplete', 'Media is still uploading or processing', 409));
      const instance = await renderScreen();
      await flush();

      await act(async () => {
        instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.onPress();
      });
      await flush(0);

      expect(texts(instance).join(' ')).toMatch(/has not finished arriving/i);
      expect(replace).not.toHaveBeenCalled();
      // Retryable — once the item lands, sealing can simply be tried again.
      expect(instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.disabled).toBe(false);
    });
  });

  describe('security — no key material, plaintext, or ciphertext is ever logged', () => {
    it('never logs the letter text, capsule key, master key, or seal response through a full render + seal cycle', async () => {
      const { capsule, capsuleKey } = await readyCapsule({ type: 'self' });
      const withText = await withLetter(capsuleKey, capsule, 'A very specific private sentence nobody else should see.');
      get.mockResolvedValue({ capsule: withText });
      sealFn.mockResolvedValue({ capsule: { ...withText, state: 'sealed' } });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const instance = await renderScreen();
        await flush();
        expect(texts(instance).join(' ')).toContain('A very specific private sentence nobody else should see.'); // sanity: the pipeline really ran

        await act(async () => {
          instance.root.findByProps({ accessibilityLabel: 'Seal capsule' }).props.onPress();
        });
        await flush(0);

        const keyMaterial = [Buffer.from(capsuleKey).toString('base64'), Buffer.from(mockMasterKey!).toString('base64')];
        for (const spy of [logSpy, errorSpy, warnSpy]) {
          for (const call of spy.mock.calls) {
            const joined = call.map((a) => String(a)).join(' ');
            expect(joined).not.toContain('A very specific private sentence');
            for (const material of keyMaterial) expect(joined).not.toContain(material);
          }
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });

    it('never imports SecureStore, AsyncStorage, or the raw @tc/crypto package by name — key material flows only through useMasterKey() and use-capsule-compose.ts', async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const here = dirname(fileURLToPath(import.meta.url));
      const source = readFileSync(join(here, '../../app/(app)/compose/[id]/review.tsx'), 'utf-8');
      const importLines = source
        .split('\n')
        .filter((line) => line.trim().startsWith('import '))
        .join('\n');
      expect(importLines).not.toMatch(/expo-secure-store|AsyncStorage|token-store|@tc\/crypto/);
    });
  });

  describe('accessibility', () => {
    it('the heading carries a header role', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      const heading = instance.root.findByProps({ accessibilityRole: 'header' });
      expect(heading).toBeTruthy();
    });

    it('the back button carries an accessible label and a role', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      const backButton = instance.root.findByProps({ accessibilityLabel: 'Back' });
      expect(backButton.props.accessibilityRole).toBe('button');
      act(() => backButton.props.onPress());
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('an enclosed item names its kind in words for accessibility, rather than letting the glyph character be read literally (E1.4.11)', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      mediaListFn.mockResolvedValue({
        data: [mediaFixture({ id: 'media-1', kind: 'audio', originalName: 'voice-note.m4a' }), mediaFixture({ id: 'media-2', kind: 'video', originalName: 'clip.mov' })],
      });
      const instance = await renderScreen();
      await flush();

      const labels = instance.root.findAllByType(Text).map((n) => n.props.accessibilityLabel).filter(Boolean);
      expect(labels).toContain('Audio, voice-note.m4a');
      expect(labels).toContain('Video, clip.mov');
    });

    it('the Seal button carries the irreversibility statement as its hint, so it is heard regardless of how a screen-reader user reaches it (E1.4.11)', async () => {
      const { capsule } = await readyCapsule({ type: 'self' });
      get.mockResolvedValue({ capsule });
      const instance = await renderScreen();
      await flush();
      const sealButton = instance.root.findByProps({ accessibilityLabel: 'Seal capsule' });
      expect(sealButton.props.accessibilityHint).toContain('cannot be changed');
    });
  });
});
