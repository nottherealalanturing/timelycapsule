import type { Recipient } from '@tc/contracts';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapsuleRecipients, type RecipientsState } from './use-capsule-recipients';

const recipients = vi.fn();
vi.mock('./api-client', () => ({
  capsulesApi: { recipients: (...args: unknown[]) => recipients(...args) },
}));

beforeEach(() => {
  recipients.mockReset();
});

function recipientFixture(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    capsuleId: '22222222-2222-2222-2222-222222222222',
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

function Harness({ capsuleId, enabled, onReady }: { capsuleId: string; enabled: boolean; onReady: (v: ReturnType<typeof useCapsuleRecipients>) => void }) {
  const value = useCapsuleRecipients(capsuleId, enabled);
  onReady(value);
  return null;
}

async function render(capsuleId = '22222222-2222-2222-2222-222222222222', enabled = true) {
  let latest!: ReturnType<typeof useCapsuleRecipients>;
  await act(async () => {
    TestRenderer.create(<Harness capsuleId={capsuleId} enabled={enabled} onReady={(v) => (latest = v)} />);
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

describe('useCapsuleRecipients', () => {
  it('starts idle when not enabled, and never calls the API', async () => {
    const h = await render('22222222-2222-2222-2222-222222222222', false);
    expect(h.current.state).toEqual({ status: 'idle' });
    expect(recipients).not.toHaveBeenCalled();
  });

  it('transitions to loading then ready once enabled', async () => {
    const items = [recipientFixture()];
    recipients.mockResolvedValue({ data: items });
    const h = await render();
    const state = h.current.state as RecipientsState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.recipients).toEqual(items);
  });

  it('transitions to ready with an empty array when there are no recipients', async () => {
    recipients.mockResolvedValue({ data: [] });
    const h = await render();
    expect((h.current.state as RecipientsState & { status: 'ready' }).recipients).toEqual([]);
  });

  it('transitions to error on failure (e.g. an unauthorized/inaccessible capsule)', async () => {
    recipients.mockRejectedValue(new Error('403'));
    const h = await render();
    expect(h.current.state).toEqual({ status: 'error' });
  });

  it('retry re-fetches and can recover from an error into ready', async () => {
    recipients.mockRejectedValueOnce(new Error('network down'));
    const h = await render();
    expect(h.current.state.status).toBe('error');

    const items = [recipientFixture()];
    recipients.mockResolvedValueOnce({ data: items });
    await h.act(() => h.current.retry());
    expect((h.current.state as RecipientsState & { status: 'ready' }).recipients).toEqual(items);
  });

  it('calls capsulesApi.recipients with the exact capsule id', async () => {
    recipients.mockResolvedValue({ data: [] });
    await render('99999999-9999-9999-9999-999999999999');
    expect(recipients).toHaveBeenCalledWith('99999999-9999-9999-9999-999999999999');
  });
});
