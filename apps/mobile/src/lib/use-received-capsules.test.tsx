import type { ReceivedCapsule } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReceivedCapsules, type ReceivedCapsulesState } from './use-received-capsules';

const list = vi.fn();
vi.mock('./api-client', () => ({
  receivedApi: { list: (...args: unknown[]) => list(...args) },
}));

beforeEach(() => {
  list.mockReset();
});

function receivedItem(overrides: Partial<ReceivedCapsule> = {}): ReceivedCapsule {
  return {
    recipientId: '22222222-2222-2222-2222-222222222222',
    capsuleId: '33333333-3333-3333-3333-333333333333',
    publicId: 'pub-2',
    section: 'upcoming',
    senderName: 'Ada Lovelace',
    senderEmail: 'ada@example.com',
    title: 'Happy birthday',
    cover: null,
    teaser: 'Open when the day comes',
    unlockAt: '2026-12-25T00:00:00.000Z',
    sealedAt: '2026-01-01T00:00:00.000Z',
    firstOpenedAt: null,
    ...overrides,
  };
}

function Harness({ onReady }: { onReady: (v: ReturnType<typeof useReceivedCapsules>) => void }) {
  const value = useReceivedCapsules();
  onReady(value);
  return null;
}

async function render() {
  let latest!: ReturnType<typeof useReceivedCapsules>;
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

describe('useReceivedCapsules', () => {
  it('starts in the loading state', async () => {
    list.mockReturnValue(new Promise(() => {})); // never resolves within this test
    const h = await render();
    expect(h.current.state.status).toBe('loading');
  });

  it('transitions to ready with the returned items on success', async () => {
    const items = [receivedItem()];
    list.mockResolvedValue({ data: items });
    const h = await render();
    const state = h.current.state as ReceivedCapsulesState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.items).toEqual(items);
  });

  it('transitions to ready with an empty array when there are no received capsules', async () => {
    list.mockResolvedValue({ data: [] });
    const h = await render();
    const state = h.current.state as ReceivedCapsulesState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.items).toEqual([]);
  });

  it('transitions to error on API/network failure, without leaking the raw error', async () => {
    list.mockRejectedValue(new Error('ECONNREFUSED'));
    const h = await render();
    expect(h.current.state).toEqual({ status: 'error' });
  });

  it('retry re-fetches and can recover from an error into ready', async () => {
    list.mockRejectedValueOnce(new Error('network down'));
    const h = await render();
    expect(h.current.state.status).toBe('error');

    const items = [receivedItem({ section: 'waiting' })];
    list.mockResolvedValueOnce({ data: items });
    await h.act(() => h.current.retry());

    const state = h.current.state as ReceivedCapsulesState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.items).toEqual(items);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
