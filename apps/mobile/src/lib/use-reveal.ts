import type { RevealResponse } from '@tc/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, revealApi } from './api-client';

export type RevealFetchState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'rate-limited' }
  | { status: 'ready'; data: RevealResponse };

/**
 * PHASE-5.1's own data-fetching hook for `GET /r/:token` — same
 * screen-local-fetch shape as `use-capsule-detail.ts` (no React Query
 * anywhere in this app), widened for the two things the reveal page needs
 * that a plain capsule fetch doesn't: gate tokens that must re-trigger a
 * fetch when they change (mirrors `apps/web/src/app/(reveal)/c/[token]/
 * page.tsx`'s own `[placeGate, identityGate]` effect dependency), and a
 * masked-404-vs-rate-limited distinction the server's own response status
 * carries (429 vs. every other non-2xx, which `findRecipientOrThrow`
 * masks as a plain 404 by design — see `apps/api/src/modules/reveal/
 * service.ts`'s own comment on why a suppressed/nonexistent token must be
 * indistinguishable from any other failure). Matches web's own
 * `catch { setState(status===429 ? 'rate-limited' : '404') }`: a genuine
 * network failure is masked the same way a suppressed token is, on both
 * platforms — not a mobile-specific choice.
 *
 * `loading` is derived, not set synchronously inside the effect (a
 * synchronous `setState` at the top of an effect body cascades renders,
 * flagged by this project's eslint react-hooks rules) — `result` only ever
 * changes from an async continuation (`.then`/`.catch`), and the rendered
 * state is "loading" whenever the last resolved key doesn't match the
 * current one.
 */
export function useReveal(
  token: string,
  gates: { placeGate: string | null; identityGate: string | null },
): { state: RevealFetchState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${token}|${gates.placeGate ?? ''}|${gates.identityGate ?? ''}|${attempt}`;
  const [result, setResult] = useState<{ key: string; state: RevealFetchState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    revealApi
      .get(token, { placeGate: gates.placeGate ?? undefined, identityGate: gates.identityGate ?? undefined })
      .then((data) => {
        if (!cancelled) setResult({ key, state: { status: 'ready', data } });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key, state: { status: err instanceof ApiClientError && err.status === 429 ? 'rate-limited' : 'not-found' } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, token, gates.placeGate, gates.identityGate]);

  const state: RevealFetchState = result?.key === key ? result.state : { status: 'loading' };
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}

/**
 * At T-0 the screen flips live into the unlocked state without the
 * recipient having to pull-to-refresh or reopen — mirrors the web reveal
 * page's own `setTimeout` scheduled against `unlockAt`. `onUnlock` is
 * captured in a ref kept current by its own effect (not assigned during
 * render, which this project's eslint rules also forbid) so the scheduled
 * timer always calls the latest callback without needing to be
 * rescheduled every time it changes identity.
 */
export function useUnlockTimer(unlockAt: string | null, onUnlock: () => void): void {
  const onUnlockRef = useRef(onUnlock);
  useEffect(() => {
    onUnlockRef.current = onUnlock;
  });

  useEffect(() => {
    if (!unlockAt) return;
    const ms = new Date(unlockAt).getTime() - Date.now();
    if (ms <= 0) return;
    // Matches web's own cap — an unlock more than ~24 days out would
    // overflow a 32-bit `setTimeout` delay; re-checking on the next fetch
    // cycle instead of scheduling a value that silently fires immediately.
    const timer = setTimeout(() => onUnlockRef.current(), Math.min(ms + 1000, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [unlockAt]);
}
