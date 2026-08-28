import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same two mocks auth-context.test.tsx needs and for the same reasons:
// react-native's package.json "main" resolves to Flow source vitest can't
// parse, and expo-secure-store is a native module with no Node entry point
// — both are transitively reached via this file's real import of
// api-client.ts (which imports `Platform` directly, and token-store.ts,
// which imports expo-secure-store).
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const secureStore = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStore.delete(key);
  }),
}));

const { capsulesApi, receivedApi, notificationsApi, mediaApi, ApiClientError } = await import('./api-client');
const { setTokens } = await import('./token-store');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const capsule = {
  id: '11111111-1111-1111-1111-111111111111',
  publicId: 'pub1',
  type: 'personal' as const,
  state: 'sealed' as const,
  title: 'A letter',
  cover: null,
  teaser: null,
  contentDocEnc: 'ignored-in-list',
  ownerKeyWrap: 'ignored-in-list',
  passphraseHint: null,
  sizeBytes: 0,
  unlockMode: 'absolute' as const,
  unlockAt: '2027-01-01T00:00:00.000Z',
  unlockLocal: null,
  sealDeadlineAt: null,
  sealedAt: '2026-01-01T00:00:00.000Z',
  extendedOnce: false,
  seals: [],
  allowDownload: false,
  recipientsVisible: false,
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
  breakGlass: 'disabled' as const,
  isFavorite: false,
  tagIds: [],
  createdAt: '2025-12-01T00:00:00.000Z',
  updatedAt: '2025-12-01T00:00:00.000Z',
};
// List items omit contentDocEnc/ownerKeyWrap per CapsuleListItemSchema.
const { contentDocEnc: _cd, ownerKeyWrap: _kw, ...capsuleListItem } = capsule;

describe('api-client.ts — capsule domain', () => {
  beforeEach(async () => {
    secureStore.clear();
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('capsulesApi.list', () => {
    it('returns the real paginated shape, including nextCursor', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [capsuleListItem], nextCursor: 'c2' }));
      const result = await capsulesApi.list();
      expect(result).toEqual({ data: [capsuleListItem], nextCursor: 'c2' });
    });

    it('builds a query string from provided filters and omits undefined ones', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [], nextCursor: null }));
      await capsulesApi.list({ state: 'sealed', favorite: true, tag: undefined });

      const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/capsules?');
      expect(calledUrl).toContain('state=sealed');
      expect(calledUrl).toContain('favorite=true');
      expect(calledUrl).not.toContain('tag=');
    });

    it('calls with no query string at all when no filters are given', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [], nextCursor: null }));
      await capsulesApi.list();
      const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
      expect(calledUrl.endsWith('/capsules')).toBe(true);
    });

    it('preserves a null nextCursor exactly as returned (collectionId-filtered / end-of-list both look like this)', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [capsuleListItem, capsuleListItem], nextCursor: null }));
      const result = await capsulesApi.list({ collectionId: '22222222-2222-2222-2222-222222222222' });
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(2);
    });

    it('propagates a server error via ApiClientError, not a raw throw', async () => {
      // Every call (the original GET and the refresh-on-401 attempt it triggers) returns
      // the same 401 — refresh correctly fails, and the original 401's error body surfaces.
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { code: 'unauthorized', message: 'no', requestId: 'x' } }, 401));
      await expect(capsulesApi.list()).rejects.toBeInstanceOf(ApiClientError);
    });
  });

  describe('capsulesApi.get', () => {
    it('returns the full capsule including a null contentDocEnc/ownerKeyWrap for a draft', async () => {
      const draft = { ...capsule, state: 'draft' as const, contentDocEnc: null, ownerKeyWrap: null };
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ capsule: draft }));
      const result = await capsulesApi.get(capsule.id);
      expect(result.capsule.contentDocEnc).toBeNull();
      expect(result.capsule.ownerKeyWrap).toBeNull();
    });

    it('surfaces a 404 as ApiClientError without special-casing ownership-vs-not-found', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'Not found', requestId: 'x' } }, 404));
      await expect(capsulesApi.get('missing')).rejects.toMatchObject({ code: 'not_found', status: 404 });
    });
  });

  describe('capsulesApi.media / replies', () => {
    it('media returns the flat, unpaginated shape as-is', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [] }));
      const result = await capsulesApi.media(capsule.id);
      expect(result).toEqual({ data: [] });
    });

    it('replies returns the ciphertext-only thread shape as-is', async () => {
      const thread = {
        recipientId: '33333333-3333-3333-3333-333333333333',
        recipientLabel: 'Someone',
        replies: [{ id: '44444444-4444-4444-4444-444444444444', author: 'sender', bodyEnc: 'abc', createdAt: '2026-01-01T00:00:00.000Z' }],
      };
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [thread] }));
      const result = await capsulesApi.replies(capsule.id);
      expect(result.data[0]!.replies[0]!.bodyEnc).toBe('abc');
    });
  });

  describe('receivedApi.list', () => {
    it('returns the flat, non-paginated shape, preserving capsuleId (not id)', async () => {
      const received = {
        recipientId: '55555555-5555-5555-5555-555555555555',
        capsuleId: capsule.id,
        publicId: 'pub1',
        section: 'waiting' as const,
        senderName: 'Someone',
        senderEmail: null,
        title: null,
        cover: null,
        teaser: null,
        unlockAt: null,
        sealedAt: null,
        firstOpenedAt: null,
      };
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [received] }));
      const result = await receivedApi.list();
      expect(result).toEqual({ data: [received] });
      expect((result.data[0] as { id?: string }).id).toBeUndefined();
      expect(result.data[0]!.capsuleId).toBe(capsule.id);
    });

    it('has no cursor/pagination concept — the raw response has no nextCursor field', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [] }));
      const result = await receivedApi.list();
      expect('nextCursor' in result).toBe(false);
    });
  });

  describe('notificationsApi.list', () => {
    it('returns the real cursor-paginated shape', async () => {
      const notification = {
        id: '66666666-6666-6666-6666-666666666666',
        category: 'social' as const,
        title: 'X replied',
        body: null,
        data: { capsuleId: capsule.id },
        readAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [notification], nextCursor: null }));
      const result = await notificationsApi.list({ limit: 10 });
      expect(result.data[0]!.data).toEqual({ capsuleId: capsule.id });
    });
  });

  describe('mediaApi.view', () => {
    it('returns the presigned url + ttl as-is', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ url: 'https://example.com/signed', expiresInSeconds: 900 }));
      const result = await mediaApi.view('media-1');
      expect(result).toEqual({ url: 'https://example.com/signed', expiresInSeconds: 900 });
    });

    it('surfaces the dedicated media_released error code without reinterpreting it', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: { code: 'media_released', message: 'This enclosure was released.', requestId: 'x' } }, 409),
      );
      await expect(mediaApi.view('media-1')).rejects.toMatchObject({ code: 'media_released' });
    });
  });
});
