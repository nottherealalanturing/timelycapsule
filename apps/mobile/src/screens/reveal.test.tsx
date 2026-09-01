import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RevealResponse } from '@tc/contracts';
import { generateMasterKey, wrapCapsuleKeyWithPassphrase } from '@tc/crypto';
import { act } from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let routeToken = 'test-token';
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ token: routeToken }),
}));

const get = vi.fn();
const requestIdentityCode = vi.fn();
const verifyIdentity = vi.fn();
const placeCheck = vi.fn();
const remind = vi.fn();
vi.mock('../lib/api-client', () => ({
  revealApi: {
    get: (...args: unknown[]) => get(...args),
    requestIdentityCode: (...args: unknown[]) => requestIdentityCode(...args),
    verifyIdentity: (...args: unknown[]) => verifyIdentity(...args),
    placeCheck: (...args: unknown[]) => placeCheck(...args),
    remind: (...args: unknown[]) => remind(...args),
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

async function flush() {
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
    contentDocEnc: 'ignored-in-5.1',
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

beforeEach(() => {
  routeToken = 'test-token';
  get.mockReset();
  requestIdentityCode.mockReset();
  verifyIdentity.mockReset();
  placeCheck.mockReset();
  remind.mockReset();
  requestForegroundPermissionsAsync.mockReset();
  getCurrentPositionAsync.mockReset();
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

describe('Passphrase Seal gate (unlocked branch — key derived, never used to decrypt)', () => {
  it('unwraps the key on the correct passphrase and stops at the "open" placeholder', async () => {
    const capsuleKey = generateMasterKey();
    const wrappedKeyB64 = await wrapCapsuleKeyWithPassphrase(capsuleKey, 'correct horse battery staple');
    get.mockResolvedValue(unlockedFixture({ passphraseSeal: { hint: 'a childhood pet', wrappedKeyB64 } }));

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

    expect(texts(instance)).toContain('This capsule is open.');
    // PHASE-5.1's own boundary: a key was derived, but never sent anywhere and never used to decrypt anything.
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

  it('goes straight to the "open" placeholder when no passphrase/identity gate is required', async () => {
    get.mockResolvedValue(unlockedFixture());
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain('This capsule is open.');
  });
});

describe('security / scope boundary — static source scan', () => {
  function sourceOf(relativePath: string): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, relativePath), 'utf-8');
  }

  it('the reveal screen never imports the owner master-key path or the owner-only capsule-crypto module', () => {
    const source = sourceOf('../../app/(reveal)/c/[token].tsx');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/master-key-context|capsule-crypto|expo-secure-store|AsyncStorage/);
  });

  it('none of the PHASE-5.1 files log the raw token, passphrase, OTP code, gate token, or coordinates', () => {
    const files = [
      '../../app/(reveal)/c/[token].tsx',
      '../../app/(reveal)/_layout.tsx',
      '../components/place-gate.tsx',
      '../components/passphrase-gate.tsx',
      '../components/identity-gate.tsx',
      '../components/seal-stamps-row.tsx',
      '../lib/use-reveal.ts',
    ];
    for (const file of files) {
      const source = sourceOf(file);
      expect(source, `${file} must not call console.* at all`).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it('PHASE-5.1 never imports letter/media decryption or confirm-read — that belongs to a later ticket', () => {
    const source = sourceOf('../../app/(reveal)/c/[token].tsx');
    expect(source).not.toMatch(/decryptContentDoc|decryptBytes|confirmRead|EnclosureViewer|decodeCapsuleKeyFromLink/);
  });
});
