import type { ReplyAuthor } from '@tc/contracts';
import { useCallback, useEffect, useState } from 'react';
import { capsulesApi } from './api-client';
import { decryptReplyBody } from './capsule-crypto';

export interface DecryptedReply {
  id: string;
  author: ReplyAuthor;
  createdAt: string;
  /** `null` when this specific reply failed to decrypt — never a placeholder for "not yet decrypted"; that's a distinct in-flight state the caller shouldn't need to see per-reply. */
  text: string | null;
}

export interface DecryptedReplyThread {
  recipientId: string;
  recipientLabel: string | null;
  replies: DecryptedReply[];
}

export type RepliesState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; threads: DecryptedReplyThread[] };

/**
 * Screen-local fetch + decrypt for the capsule detail screen's "What was
 * written back" section (E1.3.9). Unpaginated — `GET /capsules/:id/replies`
 * returns every thread and every reply in one response (matches
 * `apps/api/src/modules/replies/service.ts`'s `listThreadsForCapsule`,
 * which has no `LIMIT`/cursor at all — fine at this product's scale, same
 * reasoning already established for `capsulesApi.media`).
 *
 * `capsuleKey` (not a boolean `enabled`, unlike `useCapsuleRecipients`) is
 * the actual dependency here: a reply is capsule content, encrypted under
 * the same capsule key as the letter, so this hook simply cannot do
 * anything until the caller has already resolved that key — which only
 * happens once the letter itself decrypted successfully. This mirrors
 * `apps/web/src/components/capsule/LetterRecord.tsx`'s `OpenLetter`: its
 * `capsuleKey` query is `enabled: Boolean(masterKey && capsule.ownerKeyWrap)`,
 * and `Correspondence`'s replies are `null` until that resolves.
 *
 * A single reply failing to decrypt (corrupted `bodyEnc`, which would be
 * data corruption since every reply under one capsule shares the same key
 * that already opened the letter) does not fail the whole section — it
 * surfaces as `text: null` on that one entry, matching
 * `Correspondence.tsx`'s own per-entry `failed` state.
 */
export function useCapsuleReplies(capsuleId: string, capsuleKey: Uint8Array | null): { state: RepliesState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: Uint8Array; data: DecryptedReplyThread[] } | { key: Uint8Array; error: true } | null>(null);

  useEffect(() => {
    if (!capsuleKey) return;
    let cancelled = false;
    const key = capsuleKey;
    capsulesApi
      .replies(capsuleId)
      .then(async (res) => {
        const threads: DecryptedReplyThread[] = await Promise.all(
          res.data.map(async (thread) => ({
            recipientId: thread.recipientId,
            recipientLabel: thread.recipientLabel,
            replies: await Promise.all(
              thread.replies.map(async (reply) => {
                const decrypted = await decryptReplyBody(key, reply.bodyEnc);
                return {
                  id: reply.id,
                  author: reply.author,
                  createdAt: reply.createdAt,
                  text: decrypted.status === 'ok' ? decrypted.text : null,
                };
              }),
            ),
          })),
        );
        if (!cancelled) setResult({ key, data: threads });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [capsuleId, capsuleKey, attempt]);

  const state: RepliesState = !capsuleKey
    ? { status: 'idle' }
    : result === null || result.key !== capsuleKey
      ? { status: 'loading' }
      : 'error' in result
        ? { status: 'error' }
        : { status: 'ready', threads: result.data };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
