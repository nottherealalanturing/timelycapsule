import type { CapsuleListItem } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapsules, type CapsulesState } from './use-capsules';

const list = vi.fn();
vi.mock('./api-client', () => ({
  capsulesApi: { list: (...args: unknown[]) => list(...args) },
}));

beforeEach(() => {
  list.mockReset();
});

function capsuleFixture(overrides: Partial<CapsuleListItem> = {}): CapsuleListItem {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'sealed',
    title: 'A letter',
    cover: null,
    teaser: null,
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: '2026-06-01T00:00:00.000Z',
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: '2026-01-01T00:00:00.000Z',
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

function Harness({ onReady }: { onReady: (v: ReturnType<typeof useCapsules>) => void }) {
  const value = useCapsules();
  onReady(value);
  return null;
}

async function render() {
  let latest!: ReturnType<typeof useCapsules>;
  await act(async () => {
    TestRenderer.create(<Harness onReady={(v) => (latest = v)} />);
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

describe('useCapsules', () => {
  it('starts in the loading state', async () => {
    list.mockReturnValue(new Promise(() => {}));
    const h = await render();
    expect(h.current.state.status).toBe('loading');
  });

  it('transitions to ready with the first page on success', async () => {
    const items = [capsuleFixture()];
    list.mockResolvedValue({ data: items, nextCursor: 'cursor-1' });
    const h = await render();
    const state = h.current.state as CapsulesState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.items).toEqual(items);
    expect(state.nextCursor).toBe('cursor-1');
  });

  it('transitions to error on API/network failure', async () => {
    list.mockRejectedValue(new Error('network down'));
    const h = await render();
    expect(h.current.state).toEqual({ status: 'error' });
  });

  it('retry re-fetches the first page and can recover from an error into ready', async () => {
    list.mockRejectedValueOnce(new Error('network down'));
    const h = await render();
    expect(h.current.state.status).toBe('error');

    const items = [capsuleFixture()];
    list.mockResolvedValueOnce({ data: items, nextCursor: null });
    await h.act(() => h.current.retry());
    expect(h.current.state).toEqual({ status: 'ready', items, nextCursor: null, nextPageError: false });
  });

  it('loadMore fetches using the current nextCursor and appends rather than replacing', async () => {
    const firstPage = [capsuleFixture({ id: '11111111-1111-1111-1111-111111111111' })];
    const secondPage = [capsuleFixture({ id: '22222222-2222-2222-2222-222222222222' })];
    list.mockResolvedValueOnce({ data: firstPage, nextCursor: 'cursor-1' });
    const h = await render();

    list.mockResolvedValueOnce({ data: secondPage, nextCursor: null });
    await h.act(() => h.current.loadMore());

    expect(list).toHaveBeenNthCalledWith(2, { cursor: 'cursor-1' });
    const state = h.current.state as CapsulesState & { status: 'ready' };
    expect(state.items).toEqual([...firstPage, ...secondPage]);
    expect(state.nextCursor).toBeNull();
  });

  it('does not call loadMore again once nextCursor is null', async () => {
    list.mockResolvedValueOnce({ data: [capsuleFixture()], nextCursor: null });
    const h = await render();
    expect(list).toHaveBeenCalledTimes(1);

    await h.act(() => h.current.loadMore());
    expect(list).toHaveBeenCalledTimes(1); // no second call was ever made
  });

  it('prevents a duplicate next-page request while one is already in flight', async () => {
    list.mockResolvedValueOnce({ data: [capsuleFixture()], nextCursor: 'cursor-1' });
    const h = await render();

    let resolveSecond!: (v: unknown) => void;
    list.mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    // Two rapid calls, mirroring onEndReached firing more than once before the first request settles.
    act(() => {
      h.current.loadMore();
      h.current.loadMore();
    });
    expect(list).toHaveBeenCalledTimes(2); // 1 initial + only 1 next-page call, not 2

    await h.act(async () => {
      resolveSecond({ data: [capsuleFixture({ id: '33333333-3333-3333-3333-333333333333' })], nextCursor: null });
    });
  });

  it('preserves already-loaded items and flags nextPageError when a next-page request fails', async () => {
    const firstPage = [capsuleFixture()];
    list.mockResolvedValueOnce({ data: firstPage, nextCursor: 'cursor-1' });
    const h = await render();

    list.mockRejectedValueOnce(new Error('network down'));
    await h.act(() => h.current.loadMore());

    const state = h.current.state as CapsulesState & { status: 'ready' };
    expect(state.items).toEqual(firstPage);
    expect(state.nextCursor).toBe('cursor-1'); // unchanged, so a retry can reuse it
    expect(state.nextPageError).toBe(true);
  });

  it('a subsequent successful loadMore call clears a prior nextPageError', async () => {
    list.mockResolvedValueOnce({ data: [capsuleFixture()], nextCursor: 'cursor-1' });
    const h = await render();

    list.mockRejectedValueOnce(new Error('network down'));
    await h.act(() => h.current.loadMore());
    expect((h.current.state as CapsulesState & { status: 'ready' }).nextPageError).toBe(true);

    list.mockResolvedValueOnce({ data: [capsuleFixture({ id: '44444444-4444-4444-4444-444444444444' })], nextCursor: null });
    await h.act(() => h.current.loadMore());
    const state = h.current.state as CapsulesState & { status: 'ready' };
    expect(state.nextPageError).toBe(false);
    expect(state.items).toHaveLength(2);
  });
});
