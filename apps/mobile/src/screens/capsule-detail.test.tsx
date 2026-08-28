import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capsule, Recipient, ReplyThread } from '@tc/contracts';
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
const recipients = vi.fn();
const replies = vi.fn();
vi.mock('../lib/api-client', () => ({
  capsulesApi: {
    get: (...args: unknown[]) => get(...args),
    recipients: (...args: unknown[]) => recipients(...args),
    replies: (...args: unknown[]) => replies(...args),
  },
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

/** Flushes a pending fetch, the decrypt effect's real (genuinely async,
 * e.g. WebCrypto-backed) unwrap/decrypt chain, and — since E1.3.9 — the
 * independent recipients fetch that starts alongside it for any
 * `needs_decrypt`/`no_content` capsule regardless of whether the letter
 * itself succeeds. A couple of bare microtask ticks isn't reliably enough
 * for any of these, so this uses a real macrotask delay instead; two
 * back-to-back delays cover both the decrypt chain and the separate
 * recipients chain settling in either order. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
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
  return { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc: encodeField(iv, ciphertext) };
}

/** A reply's plaintext is bare text, unlike the letter's JSON envelope — see apps/web/src/lib/reply-crypto.ts. */
async function sealReply(capsuleKey: Uint8Array, text: string): Promise<string> {
  const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(text));
  return encodeField(iv, ciphertext);
}

function recipientFixture(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    capsuleId: '11111111-1111-1111-1111-111111111111',
    userId: null,
    email: 'ada@example.com',
    phone: null,
    displayName: 'Ada Lovelace',
    status: 'opened',
    firstOpenedAt: '2026-08-28T00:00:00.000Z',
    lastViewedAt: '2026-08-28T00:00:00.000Z',
    resolvedUnlockAt: null,
    verificationRequired: false,
    verifiedAt: null,
    isFallback: false,
    fallbackAfter: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function threadFixture(overrides: Partial<ReplyThread> = {}): ReplyThread {
  return {
    recipientId: '33333333-3333-3333-3333-333333333333',
    recipientLabel: 'Ada Lovelace',
    replies: [],
    ...overrides,
  };
}

beforeEach(() => {
  get.mockReset();
  back.mockReset();
  recipients.mockReset().mockResolvedValue({ data: [] });
  replies.mockReset().mockResolvedValue({ data: [] });
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

  describe('recipients section (E1.3.9)', () => {
    it('renders recipient data with display name and a readable status', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      recipients.mockResolvedValue({ data: [recipientFixture({ displayName: 'Ada Lovelace', status: 'viewed_locked' })] });
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Addressed to');
      expect(rendered).toContain('Ada Lovelace');
      expect(rendered).toContain('viewed locked');
    });

    it('renders nothing for an empty recipients list', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      recipients.mockResolvedValue({ data: [] });
      const instance = renderScreen();
      await flush();
      expect(texts(instance).join(' ')).not.toContain('Addressed to');
    });

    it('falls back through displayName -> email -> phone -> "Someone" for optional fields', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      recipients.mockResolvedValue({
        data: [
          recipientFixture({ id: 'a', displayName: null, email: 'grace@example.com', phone: null }),
          recipientFixture({ id: 'b', displayName: null, email: null, phone: '+15555550123' }),
          recipientFixture({ id: 'c', displayName: null, email: null, phone: null }),
        ],
      });
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('grace@example.com');
      expect(rendered).toContain('+15555550123');
      expect(rendered).toContain('Someone');
    });

    it('shows an inline error with retry when recipients fail to load, without breaking the rest of the screen', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      recipients.mockRejectedValue(new Error('403 forbidden'));
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain("We couldn't load who this was addressed to.");
      expect(rendered).not.toMatch(/403|forbidden/i);
      expect(rendered).toContain('Nothing was written yet.');

      recipients.mockResolvedValueOnce({ data: [recipientFixture()] });
      const retryButtons = instance.root.findAllByType(Pressable);
      await act(async () => {
        retryButtons[retryButtons.length - 1]!.props.onPress();
      });
      await flush();
      expect(texts(instance).join(' ')).toContain('Addressed to');
    });

    it('never fetches recipients for a Destroyed capsule', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ expiryStrict: true, state: 'expired', contentDocEnc: null, ownerKeyWrap: null }) });
      renderScreen();
      await flush();
      expect(recipients).not.toHaveBeenCalled();
    });

    it('never fetches recipients for a Withheld (sealed-to-self) capsule', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', state: 'sealed', contentDocEnc: null, ownerKeyWrap: null }) });
      renderScreen();
      await flush();
      expect(recipients).not.toHaveBeenCalled();
    });

    it('fetches recipients for a no-content draft', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      renderScreen();
      await flush();
      expect(recipients).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });

    it('fetches recipients once the capsule needs decrypting, even before the key resolves', async () => {
      mockMasterKey = null;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc: 'ciphertext', ownerKeyWrap: 'wrap' }) });
      renderScreen();
      await flush();
      expect(recipients).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });
  });

  describe('replies section (E1.3.9)', () => {
    it('renders no "What was written back" section when there are no replies', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }] }, writtenAt: null };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      replies.mockResolvedValue({ data: [] });
      const instance = renderScreen();
      await flush();
      await flush();
      expect(texts(instance).join(' ')).not.toContain('What was written back');
    });

    it('decrypts and renders a real end-to-end encrypted reply, using the same capsule key that opened the letter', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] }, writtenAt: null };
      const { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      const bodyEnc = await sealReply(capsuleKey, 'Thank you for this.');
      replies.mockResolvedValue({
        data: [threadFixture({ replies: [{ id: 'r1', author: 'recipient', bodyEnc, createdAt: '2026-08-01T00:00:00.000Z' }] })],
      });

      const instance = renderScreen();
      await flush();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('What was written back');
      expect(rendered).toContain('Ada Lovelace');
      expect(rendered).toContain('Thank you for this.');
      expect(rendered).not.toContain(bodyEnc);
    });

    it('preserves reply ordering within a thread and renders multiple threads', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }] }, writtenAt: null };
      const { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      const first = await sealReply(capsuleKey, 'First reply.');
      const second = await sealReply(capsuleKey, 'Second reply.');
      const other = await sealReply(capsuleKey, 'From Grace.');
      replies.mockResolvedValue({
        data: [
          threadFixture({
            recipientId: 'a',
            recipientLabel: 'Ada Lovelace',
            replies: [
              { id: 'r1', author: 'recipient', bodyEnc: first, createdAt: '2026-08-01T00:00:00.000Z' },
              { id: 'r2', author: 'sender', bodyEnc: second, createdAt: '2026-08-02T00:00:00.000Z' },
            ],
          }),
          threadFixture({ recipientId: 'b', recipientLabel: 'Grace', replies: [{ id: 'r3', author: 'recipient', bodyEnc: other, createdAt: '2026-08-03T00:00:00.000Z' }] }),
        ],
      });

      const instance = renderScreen();
      await flush();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      const firstIndex = rendered.indexOf('First reply.');
      const secondIndex = rendered.indexOf('Second reply.');
      const otherIndex = rendered.indexOf('From Grace.');
      expect(firstIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(firstIndex);
      expect(otherIndex).toBeGreaterThan(secondIndex);
      expect(rendered).toContain('Grace');
    });

    it('shows a loading state for replies while the letter is already readable', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }] }, writtenAt: null };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      replies.mockReturnValue(new Promise(() => {}));
      const instance = renderScreen();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Hi.');
      expect(rendered).toContain('Loading replies…');
    });

    it('shows an inline error with retry when replies fail to load, without breaking the letter', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] }, writtenAt: null };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      replies.mockRejectedValue(new Error('network down'));
      const instance = renderScreen();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain("We couldn't load the replies to this capsule.");
      expect(rendered).toContain('Dear future me,');
      expect(rendered).not.toMatch(/network down/i);

      replies.mockResolvedValueOnce({ data: [] });
      const retryButtons = instance.root.findAllByType(Pressable);
      await act(async () => {
        retryButtons[retryButtons.length - 1]!.props.onPress();
      });
      await flush();
      expect(texts(instance).join(' ')).not.toContain("We couldn't load the replies to this capsule.");
    });

    it('falls back to "Them" when a reply thread has no recipientLabel', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }] }, writtenAt: null };
      const { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      const bodyEnc = await sealReply(capsuleKey, 'A reply.');
      replies.mockResolvedValue({
        data: [threadFixture({ recipientLabel: null, replies: [{ id: 'r1', author: 'recipient', bodyEnc, createdAt: '2026-08-01T00:00:00.000Z' }] })],
      });
      const instance = renderScreen();
      await flush();
      await flush();
      await flush();
      expect(texts(instance).join(' ')).toContain('Them');
    });

    it('marks a corrupted reply as unreadable rather than showing garbled or leaked plaintext', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }] }, writtenAt: null };
      const { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      const corrupted = (await sealReply(capsuleKey, 'Never shown.')).slice(0, -4) + 'XXXX';
      replies.mockResolvedValue({
        data: [threadFixture({ replies: [{ id: 'r1', author: 'recipient', bodyEnc: corrupted, createdAt: '2026-08-01T00:00:00.000Z' }] })],
      });
      const instance = renderScreen();
      await flush();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('This could not be opened with the key for this capsule.');
      expect(rendered).not.toContain('Never shown.');
    });

    it('never fetches replies for a Destroyed capsule', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ expiryStrict: true, state: 'expired', contentDocEnc: null, ownerKeyWrap: null }) });
      renderScreen();
      await flush();
      expect(replies).not.toHaveBeenCalled();
    });

    it('never fetches replies for a Withheld (sealed-to-self) capsule', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', state: 'sealed', contentDocEnc: null, ownerKeyWrap: null }) });
      renderScreen();
      await flush();
      expect(replies).not.toHaveBeenCalled();
    });

    it('never fetches replies for a no-content draft (there is no capsule key to decrypt them with)', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      renderScreen();
      await flush();
      expect(replies).not.toHaveBeenCalled();
    });

    it('never fetches replies when Closed (master key absent)', async () => {
      mockMasterKey = null;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc: 'ciphertext', ownerKeyWrap: 'wrap' }) });
      renderScreen();
      await flush();
      expect(replies).not.toHaveBeenCalled();
    });

    it('never fetches replies when the letter itself failed to decrypt (wrong key)', async () => {
      const { ownerKeyWrap, contentDocEnc } = await buildRealCiphertext({ doc: null, writtenAt: null });
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      renderScreen();
      await flush();
      await flush();
      expect(replies).not.toHaveBeenCalled();
    });
  });

  describe('detail integration (E1.3.9)', () => {
    it('renders replies before recipients, both after the letter, without disrupting the primary reading experience', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] }, writtenAt: null };
      const { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      const bodyEnc = await sealReply(capsuleKey, 'A reply.');
      replies.mockResolvedValue({ data: [threadFixture({ replies: [{ id: 'r1', author: 'recipient', bodyEnc, createdAt: '2026-08-01T00:00:00.000Z' }] })] });
      recipients.mockResolvedValue({ data: [recipientFixture()] });

      const instance = renderScreen();
      await flush();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      const letterIndex = rendered.indexOf('Dear future me,');
      const repliesIndex = rendered.indexOf('What was written back');
      const recipientsIndex = rendered.indexOf('Addressed to');
      expect(letterIndex).toBeGreaterThan(-1);
      expect(repliesIndex).toBeGreaterThan(letterIndex);
      expect(recipientsIndex).toBeGreaterThan(repliesIndex);
    });

    it('keeps the letter readable when both recipients and replies fail to load', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] }, writtenAt: null };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      recipients.mockRejectedValue(new Error('down'));
      replies.mockRejectedValue(new Error('down'));

      const instance = renderScreen();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Dear future me,');
      expect(rendered).toContain("We couldn't load the replies to this capsule.");
      expect(rendered).toContain("We couldn't load who this was addressed to.");
    });

    it('does not show recipients or replies sections for the Destroyed state, only the destroyed message', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ expiryStrict: true, state: 'expired', contentDocEnc: null, ownerKeyWrap: null }) });
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Destroyed');
      expect(rendered).not.toContain('Addressed to');
      expect(rendered).not.toContain('What was written back');
    });

    it('does not show recipients or replies sections for the Withheld state', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', state: 'sealed', contentDocEnc: null, ownerKeyWrap: null }) });
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Sealed to yourself');
      expect(rendered).not.toContain('Addressed to');
      expect(rendered).not.toContain('What was written back');
    });

    it('shows recipients but not replies for a no-content draft', async () => {
      mockMasterKey = generateMasterKey();
      get.mockResolvedValue({ capsule: capsuleFixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }) });
      recipients.mockResolvedValue({ data: [recipientFixture()] });
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Nothing was written yet.');
      expect(rendered).toContain('Addressed to');
      expect(rendered).not.toContain('What was written back');
    });

    it('still renders the Closed state unchanged, with no recipients/replies UI attempted before a key exists', async () => {
      mockMasterKey = null;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc: 'ciphertext', ownerKeyWrap: 'wrap' }) });
      recipients.mockResolvedValue({ data: [recipientFixture()] });
      const instance = renderScreen();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).toContain('Closed.');
      expect(rendered).not.toContain('What was written back');
    });

    it('back navigation still works with recipients and replies present', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] }, writtenAt: null };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      recipients.mockResolvedValue({ data: [recipientFixture()] });
      const instance = renderScreen();
      await flush();
      await flush();
      const backButton = instance.root.findByType(TouchableOpacity);
      act(() => {
        backButton.props.onPress();
      });
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('never renders reply plaintext, recipient identifiers, ciphertext, or key material outside their intended sections', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] }, writtenAt: null };
      const { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc } = await buildRealCiphertext(envelope);
      mockMasterKey = masterKey;
      get.mockResolvedValue({ capsule: capsuleFixture({ contentDocEnc, ownerKeyWrap }) });
      const bodyEnc = await sealReply(capsuleKey, 'A private reply.');
      replies.mockResolvedValue({ data: [threadFixture({ replies: [{ id: 'r1', author: 'recipient', bodyEnc, createdAt: '2026-08-01T00:00:00.000Z' }] })] });
      recipients.mockResolvedValue({ data: [recipientFixture()] });

      const instance = renderScreen();
      await flush();
      await flush();
      await flush();
      const rendered = texts(instance).join(' ');
      expect(rendered).not.toContain(bodyEnc);
      expect(rendered).not.toContain(ownerKeyWrap);
      expect(rendered).not.toMatch(/masterKey|capsuleKey|AES-GCM|Argon2id/i);
    });
  });
});
