import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capsule } from '@tc/contracts';
import { encryptBytes, generateMasterKey, toBase64Url, wrapCapsuleKeyForOwner } from '@tc/crypto';
import { act } from 'react';
import { Pressable, Text, TouchableOpacity } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LetterEnvelope } from '../lib/capsule-crypto';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * Host components are mocked as their own tag name string, which is all
 * react-test-renderer needs to build and query a tree.
 */
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
}));

const back = vi.fn();
let routeId = '11111111-1111-1111-1111-111111111111';
vi.mock('expo-router', () => ({
  useRouter: () => ({ back, push: vi.fn() }),
  useLocalSearchParams: () => ({ id: routeId }),
}));

const get = vi.fn();
vi.mock('../lib/api-client', () => ({
  capsulesApi: { get: (...args: unknown[]) => get(...args) },
}));

let mockMasterKey: Uint8Array | null = null;
vi.mock('../lib/master-key-context', () => ({
  useMasterKey: () => ({ masterKey: mockMasterKey }),
}));

// capsule-crypto.ts, capsule-detail-state.ts, capsule-row-model.ts, tokens.ts,
// and the loading/empty/error primitives are all real — this is a genuine
// integration test of the fetch -> classify -> decrypt -> render chain, not
// a rendering-only test with the crypto mocked away.
const CapsuleDetailScreen = (await import('../../app/(app)/capsule/[id]')).default;

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<CapsuleDetailScreen />);
  });
  return instance;
}

/** Flushes both a pending fetch and the decrypt effect's real (genuinely
 * async, e.g. WebCrypto-backed) unwrap/decrypt chain — a couple of bare
 * microtask ticks isn't reliably enough for the latter, so this uses a
 * real macrotask delay instead. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function capsuleFixture(overrides: Partial<Capsule> = {}): Capsule {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'unlocked',
    title: 'A letter to future me',
    cover: null,
    teaser: null,
    contentDocEnc: null,
    ownerKeyWrap: null,
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: '2026-01-01T00:00:00.000Z',
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: '2025-12-01T00:00:00.000Z',
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

/** Matches apps/web/src/lib/capsule-crypto.ts's wire format: iv(12)||ciphertext, base64'd once. */
function encodeField(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64Url(combined);
}

async function buildRealCiphertext(envelope: LetterEnvelope) {
  const masterKey = generateMasterKey();
  const capsuleKey = generateMasterKey();
  const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
  const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(JSON.stringify(envelope)));
  return { masterKey, ownerKeyWrap, contentDocEnc: encodeField(iv, ciphertext) };
}

beforeEach(() => {
  get.mockReset();
  back.mockReset();
  mockMasterKey = null;
  routeId = '11111111-1111-1111-1111-111111111111';
});

describe('CapsuleDetailScreen', () => {
  it('renders a loading state while the capsule is being fetched', async () => {
    get.mockReturnValue(new Promise(() => {}));
    const instance = renderScreen();
    expect(texts(instance)).toContain('Loading…');
  });

  it('renders an error state with retry on API/network failure, without leaking the raw error', async () => {
    get.mockRejectedValue(new Error('ECONNREFUSED: connection refused at 10.0.2.2:4001'));
    const instance = renderScreen();
    await flush();
    const rendered = texts(instance);
    expect(rendered).toContain("We couldn't load this capsule.");
    expect(rendered.join(' ')).not.toMatch(/ECONNREFUSED|10\.0\.2\.2|4001/);
  });

  it('retries the fetch and recovers into a rendered capsule', async () => {
    get.mockRejectedValueOnce(new Error('network down'));
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain("We couldn't load this capsule.");

    get.mockResolvedValueOnce({ capsule: capsuleFixture({ title: 'Recovered' }) });
    const retryButton = instance.root.findByType(Pressable);
    await act(async () => {
      retryButton.props.onPress();
    });
    await flush();
    expect(texts(instance)).toContain('Recovered');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fetches using the exact id from the route params', async () => {
    routeId = '99999999-9999-9999-9999-999999999999';
    get.mockResolvedValue({ capsule: capsuleFixture({ id: routeId }) });
    renderScreen();
    await flush();
    expect(get).toHaveBeenCalledWith('99999999-9999-9999-9999-999999999999');
  });

  it('back button calls router.back()', async () => {
    get.mockResolvedValue({ capsule: capsuleFixture() });
    const instance = renderScreen();
    await flush();
    const backButton = instance.root.findByType(TouchableOpacity);
    act(() => {
      backButton.props.onPress();
    });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('renders the Destroyed state and never attempts decryption', async () => {
    mockMasterKey = generateMasterKey();
    get.mockResolvedValue({ capsule: capsuleFixture({ expiryStrict: true, state: 'expired', contentDocEnc: null, ownerKeyWrap: null }) });
    const instance = renderScreen();
    await flush();
    expect(texts(instance).join(' ')).toContain('Destroyed');
    expect(texts(instance).join(' ')).not.toContain('Opening.');
  });

  it('renders the Withheld state for a sealed self-capsule', async () => {
    mockMasterKey = generateMasterKey();
    get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', state: 'sealed', contentDocEnc: null, ownerKeyWrap: null }) });
    const instance = renderScreen();
    await flush();
    expect(texts(instance).join(' ')).toContain('Sealed to yourself');
  });

  it('renders the no-content/draft state for a draft with both ciphertext fields null, without calling any crypto', async () => {
    mockMasterKey = generateMasterKey();
    get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain('Nothing was written yet.');
  });

  it('renders the Closed state when masterKey is null for a capsule that otherwise needs decryption', async () => {
    mockMasterKey = null;
    get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc: 'ciphertext', ownerKeyWrap: 'wrap' }) });
    const instance = renderScreen();
    await flush();
    expect(texts(instance).join(' ')).toContain('Closed.');
  });

  it('decrypts and renders real content end to end when the master key is present', async () => {
    const envelope: LetterEnvelope = {
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] },
      writtenAt: null,
    };
    const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
    mockMasterKey = masterKey;
    get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });

    const instance = renderScreen();
    await flush();
    await flush();
    expect(texts(instance)).toContain('Dear future me,');
  });

  it('shows a safe, non-technical message for the wrong master key — never a crypto error', async () => {
    const { ownerKeyWrap, contentDocEnc } = await buildRealCiphertext({ doc: null, writtenAt: null });
    mockMasterKey = generateMasterKey(); // a different key than the one that wrapped the capsule key
    get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });

    const instance = renderScreen();
    await flush();
    await flush();
    const rendered = texts(instance).join(' ');
    expect(rendered).toContain("This capsule couldn't be opened.");
    expect(rendered).not.toMatch(/AES|GCM|Argon|auth.?tag|wrap/i);
  });

  it('shows the same safe message for corrupted ciphertext', async () => {
    const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext({ doc: null, writtenAt: null });
    const corrupted = contentDocEnc.slice(0, -4) + 'XXXX';
    mockMasterKey = masterKey;
    get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc: corrupted, ownerKeyWrap }) });

    const instance = renderScreen();
    await flush();
    await flush();
    expect(texts(instance).join(' ')).toContain("This capsule couldn't be opened.");
  });

  it('shows the same safe message for malformed (non-JSON) decrypted content', async () => {
    const masterKey = generateMasterKey();
    const capsuleKey = generateMasterKey();
    const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
    const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('not json at all'));
    const contentDocEnc = encodeField(iv, ciphertext);
    mockMasterKey = masterKey;
    get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });

    const instance = renderScreen();
    await flush();
    await flush();
    expect(texts(instance).join(' ')).toContain("This capsule couldn't be opened.");
  });

  it('never renders raw ciphertext, a master key, or crypto terminology in any user-facing string', async () => {
    const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello.' }] }] }, writtenAt: null };
    const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
    mockMasterKey = masterKey;
    get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });

    const instance = renderScreen();
    await flush();
    await flush();
    const rendered = texts(instance).join(' ');
    expect(rendered).not.toContain(contentDocEnc);
    expect(rendered).not.toContain(ownerKeyWrap);
    expect(rendered).not.toMatch(/masterKey|capsuleKey|AES-GCM|Argon2id/i);
  });

  it('never imports SecureStore, AsyncStorage, the token store, or the raw @tc/crypto package — the master key path is exclusively useMasterKey()', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../../app/(app)/capsule/[id].tsx'), 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/expo-secure-store|AsyncStorage|token-store|@tc\/crypto/);
    expect(importLines).toMatch(/master-key-context/);
  });
});
