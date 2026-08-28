import type { Recipient } from '@tc/contracts';
import { useCallback, useEffect, useState } from 'react';
import { capsulesApi } from './api-client';

export type RecipientsState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; recipients: Recipient[] };

/**
 * Screen-local fetch for the capsule detail screen's "Addressed to"
 * section (E1.3.9) — unpaginated (`GET /capsules/:id/recipients` returns
 * every row for the capsule in one response; there is no cursor to
 * preserve), and plaintext-only (name/email/phone/status — never
 * ciphertext), so there is nothing to decrypt here.
 *
 * `enabled` lets the caller decide *when* to start fetching rather than
 * this hook deciding on its own — the detail screen fetches recipients
 * whenever the capsule itself loaded, regardless of whether the letter
 * content decrypts (matching `apps/web/src/app/(app)/capsule/[id]/
 * page.tsx`'s own recipients query, which is gated only on `Boolean(capsule)`,
 * not on capsule state or the master key — recipients are addressing
 * metadata, not the letter itself, so a destroyed or withheld capsule
 * still shows who it was addressed to).
 *
 * The `status: 'idle'` value (absent from this app's other list hooks)
 * exists because this fetch doesn't necessarily start on mount — it
 * starts once `enabled` flips true, and the screen needs to tell "hasn't
 * started yet" apart from "in flight" to avoid ever rendering a loading
 * affordance before there is anything to load.
 */
export function useCapsuleRecipients(capsuleId: string, enabled: boolean): { state: RecipientsState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; data: Recipient[] } | { id: string; error: true } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    capsulesApi
      .recipients(capsuleId)
      .then((res) => {
        if (!cancelled) setResult({ id: capsuleId, data: res.data });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: capsuleId, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, capsuleId, attempt]);

  // Derived, not stored: avoids ever calling setState synchronously at the
  // top of the effect above (same pattern as the detail screen's own
  // decrypt-phase derivation) while still distinguishing "hasn't started"
  // from "in flight" from "settled for a different capsule id".
  const state: RecipientsState = !enabled
    ? { status: 'idle' }
    : result === null || result.id !== capsuleId
      ? { status: 'loading' }
      : 'error' in result
        ? { status: 'error' }
        : { status: 'ready', recipients: result.data };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
