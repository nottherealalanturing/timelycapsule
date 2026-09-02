import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RevealMedia, RevealResponse } from '@tc/contracts';
import { encodeCapsuleKeyForLink, encryptBytes, generateMasterKey, wrapCapsuleKeyWithPassphrase } from '@tc/crypto';
import { act } from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const announceForAccessibility = vi.fn();
const setAccessibilityFocus = vi.fn();
let mockReduceMotionEnabled = false;
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  Image: 'Image',
  StyleSheet: { create: (styles: unknown) => styles },
  findNodeHandle: vi.fn(() => 1),
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(async () => mockReduceMotionEnabled),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    announceForAccessibility: (...args: unknown[]) => announceForAccessibility(...args),
    setAccessibilityFocus: (...args: unknown[]) => setAccessibilityFocus(...args),
  },
}));

// PHASE-5.3's media viewer, reached whenever a rendered record has any
// `media` items — mocked the same minimal way `enclosure-viewer.test.tsx`
// does, since this file exercises the full screen tree, not the viewer in
// isolation.
vi.mock('expo-file-system', () => {
  class FakeFile {
    uri = 'file:///cache/fake-temp-file';
    create() {}
    write() {}
    get exists() {
      return true;
    }
    delete() {}
  }
  return { File: FakeFile, Paths: { cache: 'fake-cache-dir' } };
});
vi.mock('expo-video', () => ({
  useVideoPlayer: (source: unknown) => ({ source }),
  VideoView: 'VideoView',
}));
vi.mock('expo-audio', () => ({
  useAudioPlayer: (source: unknown) => ({ source, play: vi.fn(), pause: vi.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let routeToken = 'test-token';
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ token: routeToken }),
}));

let mockOpenedUrl: string | null = null;
vi.mock('expo-linking', () => ({
  useLinkingURL: () => mockOpenedUrl,
}));

// The ceremony's `useTransit` schedules real `requestAnimationFrame` calls,
// which don't exist as a global in this test environment (plain Node, no
// jsdom). A no-op stub is enough for every test here: bucket-boundary
// timing itself is covered by `reveal-transit.test.ts`'s dedicated pure-
// function tests, and every screen-level test below reaches the completed
// ceremony via `transit.skip()` (a synchronous state jump, no frame needed)
// or `alreadyOpened: true` (which never starts the animation loop at all).
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

const get = vi.fn();
const requestIdentityCode = vi.fn();
const verifyIdentity = vi.fn();
const placeCheck = vi.fn();
const remind = vi.fn();
const confirmRead = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/api-client', () => ({
  revealApi: {
    get: (...args: unknown[]) => get(...args),
    requestIdentityCode: (...args: unknown[]) => requestIdentityCode(...args),
    verifyIdentity: (...args: unknown[]) => verifyIdentity(...args),
    placeCheck: (...args: unknown[]) => placeCheck(...args),
    remind: (...args: unknown[]) => remind(...args),
    confirmRead: (...args: unknown[]) => confirmRead(...args),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

const requestForegroundPermissionsAsync = vi.fn();
const getCurrentPositionAsync = vi.fn();
vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => requestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => getCurrentPositionAsync(...args),
  Accuracy: { High: 4 },
}));

// `@tc/crypto` is real here — same convention as capsule-detail.test.tsx:
// this is a genuine integration test of the passphrase-unwrap chain, not a
// rendering-only test with the crypto mocked away.
const RevealScreen = (await import('../../app/(reveal)/c/[token]')).default;

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter((t): t is string => typeof t === 'string');
}

let activeInstance: TestRenderer.ReactTestRenderer | null = null;

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<RevealScreen />);
  });
  activeInstance = instance;
  return instance;
}

/**
 * Two back-to-back macrotask delays, not one — PHASE-5.2 chains a second
 * async step (`decryptRevealLetter`) after the reveal fetch resolves, and a
 * single 10ms `act()` window isn't reliably enough for both to settle in
 * order, matching `capsule-detail.test.tsx`'s own established reasoning for
 * the identical shape of problem (a fetch → decrypt chain).
 */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function lockedFixture(overrides: Partial<Extract<RevealResponse, { status: 'locked' }>> = {}): RevealResponse {
  return {
    status: 'locked',
    publicId: 'pub-1',
    senderName: 'Ada',
    cover: null,
    teaser: 'Something for later.',
    unlockAt: new Date(Date.now() + 60_000).toISOString(),
    unlockLocal: null,
    seals: [],
    recipientDisplayName: null,
    sealedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function unlockedFixture(overrides: Partial<Extract<RevealResponse, { status: 'unlocked' }>> = {}): RevealResponse {
  return {
    status: 'unlocked',
    publicId: 'pub-1',
    senderName: 'Ada',
    cover: null,
    // `null` by default — a real ciphertext is a per-test concern (see
    // `encryptEnvelope` below); tests that don't care about letter content
    // simply get the honest, real "empty" outcome rather than a fixture
    // value that only worked because PHASE-5.1 never tried to decrypt it.
    contentDocEnc: null,
    media: [],
    location: null,
    replyPrompt: null,
    passphraseSeal: null,
    allowDownload: false,
    recipientsVisible: false,
    requireIdentityVerification: false,
    identityVerified: false,
    alreadyOpened: false,
    ...overrides,
  };
}

/** Real `@tc/crypto` — the same wire format `capsule-crypto.ts`'s `encodeIvCiphertext` produces. */
async function encryptEnvelope(capsuleKey: Uint8Array, doc: unknown): Promise<string> {
  const { encodeIvCiphertext } = await import('../lib/capsule-crypto');
  const plaintext = new TextEncoder().encode(JSON.stringify(doc));
  const { iv, ciphertext } = await encryptBytes(capsuleKey, plaintext);
  return encodeIvCiphertext(iv, ciphertext);
}

function letterDoc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeEach(() => {
  routeToken = 'test-token';
  mockOpenedUrl = null;
  mockReduceMotionEnabled = false;
  get.mockReset();
  requestIdentityCode.mockReset();
  verifyIdentity.mockReset();
  placeCheck.mockReset();
  remind.mockReset();
  confirmRead.mockReset();
  confirmRead.mockResolvedValue(undefined);
  requestForegroundPermissionsAsync.mockReset();
  getCurrentPositionAsync.mockReset();
  announceForAccessibility.mockReset();
  setAccessibilityFocus.mockReset();
  vi.mocked(requestAnimationFrame).mockClear();
});

afterEach(() => {
  // `LockedWait`'s `useNow` runs a real `setInterval` — unmounting stops it,
  // otherwise a later test's `act()` window can catch a stray tick from a
  // still-mounted previous screen ("not wrapped in act" noise, not a real bug).
  act(() => {
    activeInstance?.unmount();
  });
  activeInstance = null;
  vi.useRealTimers();
});

describe('reveal screen — top-level states', () => {
  it('shows a loading placeholder before the fetch resolves', () => {
    get.mockReturnValue(new Promise(() => {}));
    const instance = renderScreen();
    expect(texts(instance)).toContain('Retrieving this capsule.');
  });

  it('renders the locked wait screen with sender, teaser, and horizon', async () => {
    get.mockResolvedValue(lockedFixture());
    const instance = renderScreen();
    await flush();
    const joined = texts(instance).join(' ');
    expect(joined).toContain('sealed this for you');
    expect(joined).toContain('Ada');
    expect(texts(instance)).toContain('Something for later.');
  });

  it('renders withdrawn as a distinct, honest state', async () => {
    get.mockResolvedValue({ status: 'withdrawn' } satisfies RevealResponse);
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain('This capsule was withdrawn.');
  });

  it('renders expired as a distinct, honest state', async () => {
    get.mockResolvedValue({ status: 'expired' } satisfies RevealResponse);
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain('This capsule has expired.');
  });

  it('masks a missing/suppressed token exactly like any other failure — matches the backend\'s own masked-404 design', async () => {
    get.mockRejectedValue(new Error('network down'));
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain('No capsule at this link.');
  });

  it('distinguishes a 429 as rate-limited, with a retry control', async () => {
    const { ApiClientError } = await import('../lib/api-client');
    get.mockRejectedValue(new ApiClientError('rate_limited', 'slow down', 429));
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain('Too many attempts.');
    expect(instance.root.findByProps({ accessibilityLabel: 'Try again' })).toBeTruthy();
  });
});

describe('Place Seal gate', () => {
  const placeSealed = lockedFixture({
    seals: [{ type: 'place', satisfied: false, name: 'The old lighthouse', radiusM: 500 }],
  });

  it('grants the gate and refetches once the backend confirms within range', async () => {
    get.mockResolvedValueOnce(placeSealed);
    const instance = renderScreen();
    await flush();

    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    placeCheck.mockResolvedValue({ withinRange: true, distanceM: 10, bearingDeg: 90, gateToken: 'place-gate-token' });
    get.mockResolvedValueOnce(unlockedFixture());

    const button = instance.root.findByProps({ accessibilityLabel: 'Check my location' });
    await act(async () => {
      button.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await flush();

    expect(placeCheck).toHaveBeenCalledWith('test-token', { lat: 1, lng: 2 });
    expect(get).toHaveBeenLastCalledWith('test-token', { placeGate: 'place-gate-token', identityGate: undefined });
  });

  it('states distance and does not grant the gate when out of range', async () => {
    get.mockResolvedValue(placeSealed);
    const instance = renderScreen();
    await flush();

    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    placeCheck.mockResolvedValue({ withinRange: false, distanceM: 12_000, bearingDeg: 45, gateToken: null });

    const button = instance.root.findByProps({ accessibilityLabel: 'Check my location' });
    await act(async () => {
      button.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(texts(instance).join(' ')).toContain('12.0 km away');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('shows a distinct, visible error when the check itself fails (not merely "far") — a real device finding from this ticket', async () => {
    get.mockResolvedValue(placeSealed);
    const instance = renderScreen();
    await flush();

    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPositionAsync.mockRejectedValue(new Error('location provider unavailable'));

    const button = instance.root.findByProps({ accessibilityLabel: 'Check my location' });
    await act(async () => {
      button.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(texts(instance).join(' ')).toContain('Something went wrong checking your location');
    expect(placeCheck).not.toHaveBeenCalled();
  });

  it('shows a permission-denied message without calling the backend', async () => {
    get.mockResolvedValue(placeSealed);
    const instance = renderScreen();
    await flush();

    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const button = instance.root.findByProps({ accessibilityLabel: 'Check my location' });
    await act(async () => {
      button.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(placeCheck).not.toHaveBeenCalled();
    expect(texts(instance).join(' ')).toContain("couldn't access your location");
  });
});

describe('Identity Seal gate', () => {
  const identitySealed = lockedFixture({ seals: [{ type: 'identity', satisfied: false }] });

  it('requests a code, verifies it, and refetches with the resulting gate token', async () => {
    get.mockResolvedValueOnce(identitySealed);
    const instance = renderScreen();
    await flush();

    requestIdentityCode.mockResolvedValue({ sent: true });
    const sendButton = instance.root.findByProps({ accessibilityLabel: 'Send me a code' });
    await act(async () => {
      sendButton.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    verifyIdentity.mockResolvedValue({ gateToken: 'identity-gate-token' });
    get.mockResolvedValueOnce(unlockedFixture());
    const input = instance.root.findByProps({ accessibilityLabel: 'Verification code' });
    await act(async () => {
      input.props.onChangeText('123456');
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await flush();

    expect(verifyIdentity).toHaveBeenCalledWith('test-token', '123456');
    expect(get).toHaveBeenLastCalledWith('test-token', { placeGate: undefined, identityGate: 'identity-gate-token' });
  });

  it('shows a wrong-code message on rejection and clears the input', async () => {
    const { ApiClientError } = await import('../lib/api-client');
    get.mockResolvedValue(identitySealed);
    const instance = renderScreen();
    await flush();

    requestIdentityCode.mockResolvedValue({ sent: true });
    const sendButton = instance.root.findByProps({ accessibilityLabel: 'Send me a code' });
    await act(async () => {
      sendButton.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    verifyIdentity.mockRejectedValue(new ApiClientError('invalid_or_expired_code', 'nope', 400));
    const input = instance.root.findByProps({ accessibilityLabel: 'Verification code' });
    await act(async () => {
      input.props.onChangeText('000000');
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(texts(instance).join(' ')).toContain('Wrong code');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('Passphrase Seal gate (unlocked branch)', () => {
  it('unwraps the key on the correct passphrase and decrypts the real letter behind it', async () => {
    const capsuleKey = generateMasterKey();
    const wrappedKeyB64 = await wrapCapsuleKeyWithPassphrase(capsuleKey, 'correct horse battery staple');
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('Hello from Ada.'));
    get.mockResolvedValue(unlockedFixture({ passphraseSeal: { hint: 'a childhood pet', wrappedKeyB64 }, contentDocEnc, alreadyOpened: true }));

    const instance = renderScreen();
    await flush();

    const input = instance.root.findByProps({ accessibilityLabel: 'Passphrase' });
    await act(async () => {
      input.props.onChangeText('correct horse battery staple');
    });
    const unlockButton = instance.root.findByProps({ accessibilityLabel: 'Unlock' });
    // A real Argon2id derivation (`deriveKeyFromPassword`) runs here, not a
    // mock — genuinely slower than a network round-trip in the other gate
    // tests, hence the longer wait.
    await act(async () => {
      unlockButton.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    await flush();

    expect(texts(instance)).toContain('Hello from Ada.');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('shows an error and never calls the network on a wrong passphrase', async () => {
    const capsuleKey = generateMasterKey();
    const wrappedKeyB64 = await wrapCapsuleKeyWithPassphrase(capsuleKey, 'the real passphrase');
    get.mockResolvedValue(unlockedFixture({ passphraseSeal: { hint: 'a childhood pet', wrappedKeyB64 } }));

    const instance = renderScreen();
    await flush();

    const input = instance.root.findByProps({ accessibilityLabel: 'Passphrase' });
    await act(async () => {
      input.props.onChangeText('a wrong guess');
    });
    const unlockButton = instance.root.findByProps({ accessibilityLabel: 'Unlock' });
    // A real Argon2id derivation (`deriveKeyFromPassword`) runs here, not a
    // mock — genuinely slower than a network round-trip in the other gate
    // tests, hence the longer wait.
    await act(async () => {
      unlockButton.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    expect(texts(instance).join(' ')).toContain("didn't work");
    expect(get).toHaveBeenCalledTimes(1);
  });

});

describe('PHASE-5.2 — reveal ceremony and letter decryption', () => {
  it('decrypts and displays the letter directly from the link fragment when no seal gates it', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('The garden is doing well.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: true }));

    const instance = renderScreen();
    await flush();

    expect(texts(instance)).toContain('The garden is doing well.');
    expect(texts(instance).join(' ').replace(/\s+/g, ' ')).toContain('Ada wrote to you.');
  });

  it('shows "Key missing" when the link carries no fragment and there is no passphrase seal', async () => {
    get.mockResolvedValue(unlockedFixture({ contentDocEnc: 'some-ciphertext' }));
    const instance = renderScreen();
    await flush();

    expect(texts(instance)).toContain('This link is missing its key.');
  });

  it('shows "Key mismatch" when the fragment key does not open this capsule', async () => {
    const rightKey = generateMasterKey();
    const wrongKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(rightKey, letterDoc('Never seen.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(wrongKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: true }));

    const instance = renderScreen();
    await flush();

    expect(texts(instance)).toContain('This link did not open the capsule.');
  });

  it('shows "Nothing was written." for a capsule with no content, without attempting to decrypt', async () => {
    const capsuleKey = generateMasterKey();
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc: null, alreadyOpened: true }));

    const instance = renderScreen();
    await flush();

    expect(texts(instance)).toContain('Nothing was written.');
  });

  it('alreadyOpened skips the ceremony entirely — the record renders at rest, not mid-transit', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('Read before.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: true }));

    const instance = renderScreen();
    await flush();

    // The full paragraph text is immediately present at full opacity — a
    // mid-ceremony render would only ever show a letterProgress-scaled
    // fragment, never the complete, fully-arrived record on the first flush.
    expect(texts(instance)).toContain('Read before.');
    // requestAnimationFrame is stubbed to a no-op in this file — if the
    // ceremony had actually started (`active: true`), the transit hook's
    // effect would have called it; `alreadyOpened` must keep `active`
    // false so this never happens.
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('a fresh reveal announces the crossing once and moves focus to the letter heading once it fully arrives (skip-to-end path)', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('Focus should land here.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: false }));

    const instance = renderScreen();
    await flush();

    const skip = instance.root.findByProps({ accessibilityLabel: 'Show the letter now' });
    await act(async () => {
      skip.props.onPress();
    });

    expect(texts(instance)).toContain('Focus should land here.');
    expect(announceForAccessibility).toHaveBeenCalledWith('Capsule opened. Ada wrote to you.');
    expect(setAccessibilityFocus).toHaveBeenCalled();
  });

  it('respects the real reduced-motion preference by waiting on it before the ceremony starts', async () => {
    mockReduceMotionEnabled = true;
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('Shorter, not skipped.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: false }));

    const instance = renderScreen();
    await flush();
    // Two flushes: one for the reveal fetch, a second for the async
    // `AccessibilityInfo.isReduceMotionEnabled()` resolution the ceremony
    // waits on before it starts (see `reveal-ceremony.tsx`'s own comment).
    await flush();

    const skip = instance.root.findByProps({ accessibilityLabel: 'Show the letter now' });
    await act(async () => {
      skip.props.onPress();
    });

    expect(texts(instance)).toContain('Shorter, not skipped.');
  });
});

function mediaFixture(overrides: Partial<RevealMedia> = {}): RevealMedia {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    kind: 'image',
    caption: null,
    position: 0,
    encMeta: null,
    viewUrl: 'https://signed.example/blob',
    released: false,
    releasedAt: null,
    mime: 'image/jpeg',
    originalName: 'sunset.jpg',
    ...overrides,
  };
}

describe('PHASE-5.3 — media viewer and One Reading Only', () => {
  it('renders a media item and states its kind in words, unopened by default', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('A photo from the trip.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: true, media: [mediaFixture()] }));

    const instance = renderScreen();
    await flush();

    expect(texts(instance).join(' ')).toContain('Photograph');
    expect(instance.root.findByProps({ accessibilityLabel: 'Open, Photograph, sunset.jpg' })).toBeTruthy();
  });

  it('states a released enclosure plainly, with no Open control', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('Something was here.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(
      unlockedFixture({ contentDocEnc, alreadyOpened: true, media: [mediaFixture({ released: true, releasedAt: '2026-02-01T00:00:00.000Z', viewUrl: null })] }),
    );

    const instance = renderScreen();
    await flush();

    expect(texts(instance).join(' ')).toContain('Released from storage on 1 February 2026');
    expect(instance.root.findAllByProps({ accessibilityLabel: /^Open,/ })).toHaveLength(0);
  });

  it('fires confirm-read exactly once, right after a real successful letter decrypt', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('This capsule reads once.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: false }));

    renderScreen();
    await flush();

    expect(confirmRead).toHaveBeenCalledTimes(1);
    expect(confirmRead).toHaveBeenCalledWith('test-token');
  });

  it('never fires confirm-read on a decrypt (key mismatch) failure', async () => {
    const rightKey = generateMasterKey();
    const wrongKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(rightKey, letterDoc('Never confirmed.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(wrongKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: true }));

    renderScreen();
    await flush();

    expect(confirmRead).not.toHaveBeenCalled();
  });

  it('never fires confirm-read for a capsule with nothing written — matches web\'s own "never even attempts a decrypt" behavior', async () => {
    const capsuleKey = generateMasterKey();
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc: null, alreadyOpened: true }));

    renderScreen();
    await flush();

    expect(confirmRead).not.toHaveBeenCalled();
  });

  it('does not fire confirm-read again on a re-render after it already fired once', async () => {
    const capsuleKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(capsuleKey, letterDoc('Steady state.'));
    mockOpenedUrl = `timelycapsule://c/test-token#${encodeCapsuleKeyForLink(capsuleKey)}`;
    get.mockResolvedValue(unlockedFixture({ contentDocEnc, alreadyOpened: false }));

    const instance = renderScreen();
    await flush();
    expect(confirmRead).toHaveBeenCalledTimes(1);

    // A skip-to-end tap re-renders the ceremony tree repeatedly as the
    // transit finishes — confirm-read must not be sensitive to that at all.
    const skip = instance.root.findByProps({ accessibilityLabel: 'Show the letter now' });
    await act(async () => {
      skip.props.onPress();
    });
    await flush();

    expect(confirmRead).toHaveBeenCalledTimes(1);
  });
});

describe('security / scope boundary — static source scan', () => {
  function sourceOf(relativePath: string): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, relativePath), 'utf-8');
  }

  function importLinesOf(relativePath: string): string {
    return sourceOf(relativePath)
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
  }

  it('the reveal screen and its PHASE-5.2 crypto helper never import the owner master-key path', () => {
    // A precise identifier check against actual imports, not a blanket ban
    // on `capsule-crypto` (PHASE-5.2 legitimately reuses that module's
    // shared, non-owner-specific exports: `decryptField`, `readEnvelope`,
    // `emptyEnvelope`) and not a whole-file text scan (this ticket's own
    // comments name the forbidden owner-only functions explicitly, by
    // design, to document why they're avoided — scanning prose as well as
    // code would make the test fail on its own documentation).
    for (const file of ['../../app/(reveal)/c/[token].tsx', '../lib/reveal-crypto.ts', '../components/reveal-ceremony.tsx']) {
      const importLines = importLinesOf(file);
      expect(importLines, `${file} must never import the owner master-key path`).not.toMatch(/master-key-context|resolveCapsuleKey|decryptCapsuleContent/);
    }
  });

  it('none of the PHASE-5.1/5.2 files log the raw token, passphrase, OTP code, gate token, coordinates, or decrypted plaintext', () => {
    const files = [
      '../../app/(reveal)/c/[token].tsx',
      '../../app/(reveal)/_layout.tsx',
      '../components/place-gate.tsx',
      '../components/passphrase-gate.tsx',
      '../components/identity-gate.tsx',
      '../components/seal-stamps-row.tsx',
      '../components/reveal-ceremony.tsx',
      '../components/enclosure-viewer.tsx',
      '../lib/use-reveal.ts',
      '../lib/reveal-crypto.ts',
      '../lib/reveal-transit.ts',
      '../lib/enclosure-media.ts',
      '../lib/media-temp-file.ts',
    ];
    for (const file of files) {
      const source = sourceOf(file);
      expect(source, `${file} must not call console.* at all`).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it('PHASE-5.3 never imports reply composition, download-a-copy, or save-to-account — that belongs to PHASE-6', () => {
    for (const file of ['../../app/(reveal)/c/[token].tsx', '../components/reveal-ceremony.tsx', '../components/enclosure-viewer.tsx', '../lib/reveal-crypto.ts', '../lib/enclosure-media.ts']) {
      const importLines = importLinesOf(file);
      expect(importLines, file).not.toMatch(/sealReply|Correspondence|listReplies|saveToAccount/);
    }
  });

  it('media temp files are never written outside the OS cache directory', () => {
    const importLines = importLinesOf('../lib/media-temp-file.ts');
    expect(importLines).toMatch(/Paths/);
    const source = sourceOf('../lib/media-temp-file.ts');
    expect(source).not.toMatch(/Paths\.document/);
  });
});
