import type { Capsule, Recipient } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapsuleDraftState } from './use-capsule-draft';

// react-native's package.json "main" resolves to Flow-typed source (Metro
// strips Flow via babel; vitest's plain esbuild/rollup pipeline can't parse
// it) — needed here only because api-client.ts's real module (loaded below
// via vi.importActual, to keep its real ApiClientError class) imports
// `Platform` from it.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// token-store.ts (imported transitively via the real api-client.ts module
// above) uses expo-secure-store, which pulls in expo-modules-core's native
// bootstrapping — irrelevant here and not runnable under vitest.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

const get = vi.fn();
const patchFn = vi.fn();
const recipientsList = vi.fn();
const recipientsCreate = vi.fn();
const recipientsDelete = vi.fn();

vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client');
  return {
    ...actual,
    capsulesApi: {
      get: (...args: unknown[]) => get(...args),
      patch: (...args: unknown[]) => patchFn(...args),
      recipients: (...args: unknown[]) => recipientsList(...args),
    },
    recipientsApi: {
      create: (...args: unknown[]) => recipientsCreate(...args),
      delete: (...args: unknown[]) => recipientsDelete(...args),
    },
  };
});

const { useCapsuleDraft } = await import('./use-capsule-draft');

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
    email: 'ada@example.com',
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

beforeEach(() => {
  get.mockReset();
  patchFn.mockReset();
  recipientsList.mockReset();
  recipientsCreate.mockReset();
  recipientsDelete.mockReset();
});

function Harness({ id, onReady }: { id: string; onReady: (v: ReturnType<typeof useCapsuleDraft>) => void }) {
  const value = useCapsuleDraft(id);
  onReady(value);
  return null;
}

async function render(id = '11111111-1111-1111-1111-111111111111') {
  let latest!: ReturnType<typeof useCapsuleDraft>;
  await act(async () => {
    TestRenderer.create(<Harness id={id} onReady={(v) => (latest = v)} />);
  });
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

describe('useCapsuleDraft', () => {
  it('loads the capsule and its recipients together into a ready state', async () => {
    get.mockResolvedValue({ capsule: capsuleFixture() });
    recipientsList.mockResolvedValue({ data: [recipientFixture()] });

    const h = await render();
    const state = h.current.state as CapsuleDraftState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.capsule.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(state.recipients).toHaveLength(1);
  });

  it('transitions to error if either the capsule or the recipients fetch fails', async () => {
    get.mockResolvedValue({ capsule: capsuleFixture() });
    recipientsList.mockRejectedValue(new Error('network down'));

    const h = await render();
    expect(h.current.state).toEqual({ status: 'error' });
  });

  it('retry re-fetches and can recover from an error into ready', async () => {
    get.mockRejectedValueOnce(new Error('network down'));
    recipientsList.mockResolvedValue({ data: [] });
    const h = await render();
    expect(h.current.state.status).toBe('error');

    get.mockResolvedValueOnce({ capsule: capsuleFixture() });
    await h.act(() => h.current.retry());
    expect(h.current.state.status).toBe('ready');
  });

  describe('patch', () => {
    it('sends only the given fields and merges the server response into state', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      patchFn.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      await h.act(() => h.current.patch({ type: 'self' }));
      expect(patchFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', { type: 'self' });
      expect((h.current.state as CapsuleDraftState & { status: 'ready' }).capsule.type).toBe('self');
    });

    it('returns true on success and false on failure, setting patchError only on failure', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      patchFn.mockResolvedValueOnce({ capsule: capsuleFixture() });
      let result: boolean | undefined;
      await h.act(async () => {
        result = await h.current.patch({ type: 'personal' });
      });
      expect(result).toBe(true);
      expect(h.current.patchError).toBeNull();

      patchFn.mockRejectedValueOnce(new Error('network down'));
      await h.act(async () => {
        result = await h.current.patch({ type: 'personal' });
      });
      expect(result).toBe(false);
      expect(h.current.patchError).not.toBeNull();
    });

    it('states a schedule-bounds rejection specifically (E1.4.10) — distinct from a network failure', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      const { ApiClientError } = await import('./api-client');
      patchFn.mockRejectedValueOnce(new ApiClientError('unlock_in_past', 'unlockAt must be at least 5 minutes from now', 422));
      await h.act(() => h.current.patch({ unlockAt: new Date().toISOString() }));
      expect(h.current.patchError).toMatch(/five minutes/);
    });

    it('states an already-sealed rejection with the same copy the compose autosave path already uses (E1.4.10)', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      const { ApiClientError } = await import('./api-client');
      patchFn.mockRejectedValueOnce(new ApiClientError('capsule_sealed', 'Capsule is sealed', 409));
      await h.act(() => h.current.patch({ type: 'self' }));
      expect(h.current.patchError).toBe('This capsule has already been sealed and can no longer be edited.');
    });
  });

  describe('addRecipient / removeRecipient', () => {
    it('appends the new recipient returned by the server on success', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      const recipient = recipientFixture({ email: 'amara@example.com' });
      recipientsCreate.mockResolvedValue({ recipient, accessToken: 'raw' });
      await h.act(() => h.current.addRecipient({ email: 'amara@example.com' }));

      const state = h.current.state as CapsuleDraftState & { status: 'ready' };
      expect(state.recipients).toHaveLength(1);
      expect(state.recipients[0]!.email).toBe('amara@example.com');
    });

    it('sets a specific message for a duplicate recipient, and a generic one otherwise', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      const { ApiClientError } = await import('./api-client');
      recipientsCreate.mockRejectedValueOnce(new ApiClientError('recipient_already_added', 'Already added', 409));
      await h.act(() => h.current.addRecipient({ email: 'amara@example.com' }));
      expect(h.current.recipientError).toBe('That recipient is already added.');

      recipientsCreate.mockRejectedValueOnce(new Error('network down'));
      await h.act(() => h.current.addRecipient({ email: 'jordan@example.com' }));
      expect(h.current.recipientError).toBe('That recipient could not be added.');
    });

    it('states the per-capsule recipient limit specifically, not a generic message (E1.4.10)', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [] });
      const h = await render();

      const { ApiClientError } = await import('./api-client');
      recipientsCreate.mockRejectedValueOnce(new ApiClientError('quota_exceeded', 'Plan limit reached: recipients_per_capsule:3', 403));
      await h.act(() => h.current.addRecipient({ email: 'amara@example.com' }));
      expect(h.current.recipientError).toBe('This capsule already has as many recipients as this plan allows.');
    });

    it('states a locked-recipients rejection specifically when removing (E1.4.10)', async () => {
      const recipient = recipientFixture();
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [recipient] });
      const h = await render();

      const { ApiClientError } = await import('./api-client');
      recipientsDelete.mockRejectedValueOnce(new ApiClientError('recipient_locked', 'Recipients can only be edited before the capsule unlocks', 409));
      await h.act(() => h.current.removeRecipient(recipient.id));
      expect(h.current.recipientError).toBe('Recipients can only be changed before this capsule opens.');
    });

    it('removes the recipient from state on successful delete', async () => {
      const recipient = recipientFixture();
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [recipient] });
      const h = await render();
      expect((h.current.state as CapsuleDraftState & { status: 'ready' }).recipients).toHaveLength(1);

      recipientsDelete.mockResolvedValue(undefined);
      await h.act(() => h.current.removeRecipient(recipient.id));
      expect((h.current.state as CapsuleDraftState & { status: 'ready' }).recipients).toHaveLength(0);
    });

    it('keeps the recipient in state and sets an error if delete fails', async () => {
      const recipient = recipientFixture();
      get.mockResolvedValue({ capsule: capsuleFixture() });
      recipientsList.mockResolvedValue({ data: [recipient] });
      const h = await render();

      recipientsDelete.mockRejectedValue(new Error('network down'));
      await h.act(() => h.current.removeRecipient(recipient.id));
      expect((h.current.state as CapsuleDraftState & { status: 'ready' }).recipients).toHaveLength(1);
      expect(h.current.recipientError).toBe('That recipient could not be removed.');
    });
  });
});
