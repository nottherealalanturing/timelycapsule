import type { ReplyThread } from '@tc/contracts';
import { encryptBytes, generateMasterKey, toBase64Url } from '@tc/crypto';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapsuleReplies, type RepliesState } from './use-capsule-replies';

const replies = vi.fn();
vi.mock('./api-client', () => ({
  capsulesApi: { replies: (...args: unknown[]) => replies(...args) },
}));

beforeEach(() => {
  replies.mockReset();
});

/** Matches apps/web/src/lib/reply-crypto.ts's wire format: iv(12)||ciphertext, base64'd once. */
function encodeField(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64Url(combined);
}

async function sealReply(capsuleKey: Uint8Array, text: string): Promise<string> {
  const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(text));
  return encodeField(iv, ciphertext);
}

function threadFixture(overrides: Partial<ReplyThread> = {}): ReplyThread {
  return {
    recipientId: '33333333-3333-3333-3333-333333333333',
    recipientLabel: 'Ada Lovelace',
    replies: [],
    ...overrides,
  };
}

function Harness({
  capsuleId,
  capsuleKey,
  onReady,
}: {
  capsuleId: string;
  capsuleKey: Uint8Array | null;
  onReady: (v: ReturnType<typeof useCapsuleReplies>) => void;
}) {
  const value = useCapsuleReplies(capsuleId, capsuleKey);
  onReady(value);
  return null;
}

async function render(capsuleId: string, capsuleKey: Uint8Array | null) {
  let latest!: ReturnType<typeof useCapsuleReplies>;
  await act(async () => {
    TestRenderer.create(<Harness capsuleId={capsuleId} capsuleKey={capsuleKey} onReady={(v) => (latest = v)} />);
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('useCapsuleReplies', () => {
  it('starts idle when capsuleKey is null, and never calls the API', async () => {
    const h = await render('cap-1', null);
    expect(h.current.state).toEqual({ status: 'idle' });
    expect(replies).not.toHaveBeenCalled();
  });

  it('decrypts real replies end to end and reports them ready, oldest first as the API returns them', async () => {
    const capsuleKey = generateMasterKey();
    const first = await sealReply(capsuleKey, 'Thank you for this.');
    const second = await sealReply(capsuleKey, 'I read it twice.');
    replies.mockResolvedValue({
      data: [
        threadFixture({
          replies: [
            { id: 'r1', author: 'recipient', bodyEnc: first, createdAt: '2026-08-01T00:00:00.000Z' },
            { id: 'r2', author: 'sender', bodyEnc: second, createdAt: '2026-08-02T00:00:00.000Z' },
          ],
        }),
      ],
    });

    const h = await render('cap-1', capsuleKey);
    await flush();

    const state = h.current.state as RepliesState & { status: 'ready' };
    expect(state.status).toBe('ready');
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0]!.recipientLabel).toBe('Ada Lovelace');
    expect(state.threads[0]!.replies).toEqual([
      { id: 'r1', author: 'recipient', createdAt: '2026-08-01T00:00:00.000Z', text: 'Thank you for this.' },
      { id: 'r2', author: 'sender', createdAt: '2026-08-02T00:00:00.000Z', text: 'I read it twice.' },
    ]);
  });

  it('reports ready with an empty threads array when there are no replies', async () => {
    const capsuleKey = generateMasterKey();
    replies.mockResolvedValue({ data: [] });
    const h = await render('cap-1', capsuleKey);
    await flush();
    expect((h.current.state as RepliesState & { status: 'ready' }).threads).toEqual([]);
  });

  it('preserves multiple threads (one per recipient) in the order the API returns them', async () => {
    const capsuleKey = generateMasterKey();
    const bodyEnc = await sealReply(capsuleKey, 'Hi');
    replies.mockResolvedValue({
      data: [
        threadFixture({ recipientId: 'a', recipientLabel: 'Ada', replies: [{ id: 'r1', author: 'recipient', bodyEnc, createdAt: '2026-08-01T00:00:00.000Z' }] }),
        threadFixture({ recipientId: 'b', recipientLabel: 'Grace', replies: [] }),
      ],
    });
    const h = await render('cap-1', capsuleKey);
    await flush();
    const state = h.current.state as RepliesState & { status: 'ready' };
    expect(state.threads.map((t) => t.recipientLabel)).toEqual(['Ada', 'Grace']);
  });

  it('marks one corrupted reply as text: null without failing the whole section', async () => {
    const capsuleKey = generateMasterKey();
    const good = await sealReply(capsuleKey, 'This one is fine.');
    const corrupted = (await sealReply(capsuleKey, 'This one is not.')).slice(0, -4) + 'XXXX';
    replies.mockResolvedValue({
      data: [
        threadFixture({
          replies: [
            { id: 'good', author: 'recipient', bodyEnc: good, createdAt: '2026-08-01T00:00:00.000Z' },
            { id: 'bad', author: 'recipient', bodyEnc: corrupted, createdAt: '2026-08-02T00:00:00.000Z' },
          ],
        }),
      ],
    });
    const h = await render('cap-1', capsuleKey);
    await flush();
    const state = h.current.state as RepliesState & { status: 'ready' };
    const byId = Object.fromEntries(state.threads[0]!.replies.map((r) => [r.id, r.text]));
    expect(byId.good).toBe('This one is fine.');
    expect(byId.bad).toBeNull();
  });

  it('never attempts decryption with the wrong capsule key silently succeeding — a mismatched key reports text: null', async () => {
    const bodyEnc = await sealReply(generateMasterKey(), 'Secret');
    replies.mockResolvedValue({ data: [threadFixture({ replies: [{ id: 'r1', author: 'recipient', bodyEnc, createdAt: '2026-08-01T00:00:00.000Z' }] })] });
    const h = await render('cap-1', generateMasterKey()); // a different key than the one that sealed it
    await flush();
    const state = h.current.state as RepliesState & { status: 'ready' };
    expect(state.threads[0]!.replies[0]!.text).toBeNull();
  });

  it('transitions to error when the replies request itself fails', async () => {
    replies.mockRejectedValue(new Error('network down'));
    const h = await render('cap-1', generateMasterKey());
    await flush();
    expect(h.current.state).toEqual({ status: 'error' });
  });

  it('retry re-fetches and can recover from an error into ready', async () => {
    const capsuleKey = generateMasterKey();
    replies.mockRejectedValueOnce(new Error('network down'));
    const h = await render('cap-1', capsuleKey);
    await flush();
    expect(h.current.state.status).toBe('error');

    replies.mockResolvedValueOnce({ data: [] });
    await h.act(async () => {
      h.current.retry();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(h.current.state.status).toBe('ready');
  });

  it('calls capsulesApi.replies with the exact capsule id', async () => {
    replies.mockResolvedValue({ data: [] });
    await render('exact-capsule-id', generateMasterKey());
    await flush();
    expect(replies).toHaveBeenCalledWith('exact-capsule-id');
  });
});
