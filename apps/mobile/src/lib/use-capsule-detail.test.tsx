import type { Capsule } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapsuleDetail, type CapsuleDetailFetchState } from './use-capsule-detail';

const get = vi.fn();
vi.mock('./api-client', () => ({
  capsulesApi: { get: (...args: unknown[]) => get(...args) },
}));

beforeEach(() => {
  get.mockReset();
});

function capsuleFixture(overrides: Partial<Capsule> = {}): Capsule {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'unlocked',
    title: 'A letter',
    cover: null,
    teaser: null,
    contentDocEnc: 'ciphertext',
    ownerKeyWrap: 'wrap',
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

function Harness({ id, onReady }: { id: string; onReady: (v: ReturnType<typeof useCapsuleDetail>) => void }) {
  const value = useCapsuleDetail(id);
  onReady(value);
  return null;
}

async function render(id = '11111111-1111-1111-1111-111111111111') {
  let latest!: ReturnType<typeof useCapsuleDetail>;
  await act(async () => {
    TestRenderer.create(<Harness id={id} onReady={(v) => (latest = v)} />);
  });
  return {
    get current() {
      return latest;
    },
    act: async (fn: () => Promise<void> | void) => {
      await act(async () => {
        await fn();
      });
    },
  };
}

describe('useCapsuleDetail', () => {
  it('starts in the loading state', async () => {
    get.mockReturnValue(new Promise(() => {}));
    const h = await render();
    expect(h.current.state.status).toBe('loading');
  });

  it('transitions to ready with the fetched capsule on success', async () => {
    const capsule = capsuleFixture();
    get.mockResolvedValue({ capsule });
    const h = await render();
    const state = h.current.state as CapsuleDetailFetchState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.capsule).toEqual(capsule);
  });

  it('transitions to error on API/network failure, without leaking the raw error', async () => {
    get.mockRejectedValue(new Error('404 not found'));
    const h = await render();
    expect(h.current.state).toEqual({ status: 'error' });
  });

  it('calls capsulesApi.get with the exact route id', async () => {
    get.mockResolvedValue({ capsule: capsuleFixture() });
    await render('22222222-2222-2222-2222-222222222222');
    expect(get).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('retry re-fetches and can recover from an error into ready', async () => {
    get.mockRejectedValueOnce(new Error('network down'));
    const h = await render();
    expect(h.current.state.status).toBe('error');

    const capsule = capsuleFixture();
    get.mockResolvedValueOnce({ capsule });
    await h.act(() => h.current.retry());

    const state = h.current.state as CapsuleDetailFetchState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.capsule).toEqual(capsule);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
