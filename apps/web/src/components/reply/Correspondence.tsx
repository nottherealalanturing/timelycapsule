'use client';

import type { Reply } from '@tc/contracts';
import { Button, Hallmark } from '@tc/ui-web';
import { useEffect, useState } from 'react';
import { openReply } from '../../lib/reply-crypto';

/**
 * Openings, not canned sentiments.
 *
 * These were five chips that *sent on click* — so the most common way to use
 * the reply feature was to fire an unchangeable four-word message by touching
 * a button once, and anything typed afterwards was discarded. They are kept
 * because a blank sheet is genuinely hard when you have just been read to by
 * someone who is gone, but they now fill the composer instead of sending it.
 * The writer still decides what leaves.
 */
const OPENINGS = ['Thank you', 'I miss you', 'I remember', 'This landed', 'I love you'] as const;

export interface CorrespondenceProps {
  replies: Reply[];
  capsuleKey: Uint8Array | null;
  /** What to call the other party in the margin. */
  theirName: string;
  /** Which side the viewer is on — decides whose replies read as "You". */
  viewerIs: 'sender' | 'recipient';
  onSend?: (text: string) => Promise<void>;
  /** Stated instead of the composer when writing back is not available. */
  closedReason?: string | null;
}

/**
 * **The correspondence a capsule opened into.**
 *
 * Deliberately not a messaging UI. There are no bubbles, no avatars, no
 * alignment-by-author, no unread dots and no typing state — a capsule is a
 * letter, and what follows a letter is more letters, kept in the order they
 * were written. So this is the same object the rest of the product is made of:
 * entries divided by rules, each with a hallmark saying who and when, set in
 * the record register because it is prose someone wrote to be read.
 *
 * It is one component for both sides. The sender reading their capsule and the
 * recipient reading their reveal get the same thing, differing only in which
 * author reads as "You" — the alternative was two divergent inboxes, which is
 * the mistake M2 spent its whole milestone undoing for media.
 */
export function Correspondence({
  replies,
  capsuleKey,
  theirName,
  viewerIs,
  onSend,
  closedReason,
}: CorrespondenceProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (replies.length === 0 && !onSend) return null;

  return (
    <section className="flex flex-col gap-5 border-t border-[var(--color-rule)] pt-6">
      <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
        {replies.length > 0 ? 'What was written back' : 'Write back'}
      </span>

      {replies.length > 0 ? (
        <ol className="flex flex-col">
          {replies.map((reply) => (
            <ReplyEntry
              key={reply.id}
              reply={reply}
              capsuleKey={capsuleKey}
              who={reply.author === viewerIs ? 'You' : theirName}
            />
          ))}
        </ol>
      ) : null}

      {onSend ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {OPENINGS.map((opening) => (
              <button
                key={opening}
                type="button"
                // Fills, never sends. See OPENINGS above.
                onClick={() => setDraft((d) => (d.trim() ? d : opening))}
                className="rounded-[var(--radius-record)] border border-[var(--color-rule)] px-3 py-1.5 text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]"
              >
                {opening}
              </button>
            ))}
          </div>

          <label htmlFor="reply-body" className="sr-only">
            Write back to {theirName}
          </label>
          <textarea
            id="reply-body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full rounded-[var(--radius-record)] border border-[var(--color-rule)] bg-transparent p-3 text-[length:var(--text-body-s)]"
          />

          {error ? (
            <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={!draft.trim() || sending}
              onClick={async () => {
                setSending(true);
                setError(null);
                try {
                  await onSend(draft.trim());
                  setDraft('');
                } catch {
                  // Kept in the box. Losing what someone wrote because a
                  // request failed is not an acceptable way to fail here.
                  setError('That did not send. What you wrote is still here — try again.');
                } finally {
                  setSending(false);
                }
              }}
            >
              {sending ? 'Sending' : 'Send'}
            </Button>
            <span className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]">
              Sealed to {theirName} the way the letter was. We cannot read it.
            </span>
          </div>
        </div>
      ) : closedReason ? (
        <p className="text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]">{closedReason}</p>
      ) : null}
    </section>
  );
}

/**
 * One reply, opened on the device.
 *
 * The text arrives as ciphertext and is decrypted here, which is why a reply
 * can be listed by a server that cannot read it. A reply that will not open is
 * *stated* rather than dropped: an empty space where someone's words were is
 * the worst possible way to report a key problem.
 */
function ReplyEntry({ reply, capsuleKey, who }: { reply: Reply; capsuleKey: Uint8Array | null; who: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!capsuleKey) return;
    let live = true;
    openReply(capsuleKey, reply.bodyEnc)
      .then((t) => {
        if (live) setText(t);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [capsuleKey, reply.bodyEnc]);

  return (
    <li className="flex flex-col gap-2 border-b border-[var(--color-rule)] py-4 first:border-t">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Hallmark>{who}</Hallmark>
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] tabular-nums text-[var(--color-text-secondary)]">
          {new Date(reply.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {failed ? (
        <p className="text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]">
          This could not be opened with the key for this capsule.
        </p>
      ) : text === null ? (
        <p className="text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]">Opening.</p>
      ) : (
        text
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))
      )}
    </li>
  );
}
