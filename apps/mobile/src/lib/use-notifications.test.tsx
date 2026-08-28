import type { Notification } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications, type NotificationsState } from './use-notifications';

const list = vi.fn();
vi.mock('./api-client', () => ({
  notificationsApi: { list: (...args: unknown[]) => list(...args) },
}));

beforeEach(() => {
  list.mockReset();
});

function notificationFixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'social',
    title: 'Ada opened your capsule',
    body: null,
    data: { capsuleId: '22222222-2222-2222-2222-222222222222' },
    readAt: null,
    createdAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}

function Harness({ onReady }: { onReady: (v: ReturnType<typeof useNotifications>) => void }) {
  const value = useNotifications();
  onReady(value);
  return null;
}

async function render() {
  let latest!: ReturnType<typeof useNotifications>;
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

describe('useNotifications', () => {
  it('starts in the loading state', async () => {
    list.mockReturnValue(new Promise(() => {}));
    const h = await render();
    expect(h.current.state.status).toBe('loading');
  });

  it('transitions to ready with the first page on success', async () => {
    const items = [notificationFixture()];
    list.mockResolvedValue({ data: items, nextCursor: 'cursor-1' });
    const h = await render();
    const state = h.current.state as NotificationsState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.items).toEqual(items);
    expect(state.nextCursor).toBe('cursor-1');
  });

  it('transitions to ready with an empty array for an account with no notifications', async () => {
    list.mockResolvedValue({ data: [], nextCursor: null });
    const h = await render();
    const state = h.current.state as NotificationsState & { status: 'ready' };
    expect(state.items).toEqual([]);
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

    const items = [notificationFixture()];
    list.mockResolvedValueOnce({ data: items, nextCursor: null });
    await h.act(() => h.current.retry());
    expect(h.current.state).toEqual({ status: 'ready', items, nextCursor: null, nextPageError: false });
  });

  it('loadMore fetches using the current nextCursor and appends rather than replacing', async () => {
    const firstPage = [notificationFixture({ id: '11111111-1111-1111-1111-111111111111' })];
    const secondPage = [notificationFixture({ id: '44444444-4444-4444-4444-444444444444' })];
    list.mockResolvedValueOnce({ data: firstPage, nextCursor: 'cursor-1' });
    const h = await render();

    list.mockResolvedValueOnce({ data: secondPage, nextCursor: null });
    await h.act(() => h.current.loadMore());

    expect(list).toHaveBeenNthCalledWith(2, { cursor: 'cursor-1' });
    const state = h.current.state as NotificationsState & { status: 'ready' };
    expect(state.items).toEqual([...firstPage, ...secondPage]);
    expect(state.nextCursor).toBeNull();
  });

  it('does not call loadMore again once nextCursor is null', async () => {
    list.mockResolvedValueOnce({ data: [notificationFixture()], nextCursor: null });
    const h = await render();
    expect(list).toHaveBeenCalledTimes(1);

    await h.act(() => h.current.loadMore());
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('prevents a duplicate next-page request while one is already in flight', async () => {
    list.mockResolvedValueOnce({ data: [notificationFixture()], nextCursor: 'cursor-1' });
    const h = await render();

    let resolveSecond!: (v: unknown) => void;
    list.mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    act(() => {
      h.current.loadMore();
      h.current.loadMore();
    });
    expect(list).toHaveBeenCalledTimes(2); // 1 initial + only 1 next-page call, not 2

    await h.act(async () => {
      resolveSecond({ data: [notificationFixture({ id: '55555555-5555-5555-5555-555555555555' })], nextCursor: null });
    });
  });

  it('preserves already-loaded items and flags nextPageError when a next-page request fails', async () => {
    const firstPage = [notificationFixture()];
    list.mockResolvedValueOnce({ data: firstPage, nextCursor: 'cursor-1' });
    const h = await render();

    list.mockRejectedValueOnce(new Error('network down'));
    await h.act(() => h.current.loadMore());

    const state = h.current.state as NotificationsState & { status: 'ready' };
    expect(state.items).toEqual(firstPage);
    expect(state.nextCursor).toBe('cursor-1');
    expect(state.nextPageError).toBe(true);
  });

  it('retrying a failed next-page request (calling loadMore again) succeeds and clears the error', async () => {
    list.mockResolvedValueOnce({ data: [notificationFixture()], nextCursor: 'cursor-1' });
    const h = await render();

    list.mockRejectedValueOnce(new Error('network down'));
    await h.act(() => h.current.loadMore());
    expect((h.current.state as NotificationsState & { status: 'ready' }).nextPageError).toBe(true);

    list.mockResolvedValueOnce({ data: [notificationFixture({ id: '66666666-6666-6666-6666-666666666666' })], nextCursor: null });
    await h.act(() => h.current.loadMore());
    const state = h.current.state as NotificationsState & { status: 'ready' };
    expect(state.nextPageError).toBe(false);
    expect(state.items).toHaveLength(2);
  });
});
