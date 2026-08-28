import type { ReceivedCapsule } from '@tc/contracts';
import { useCallback, useEffect, useState } from 'react';
import { receivedApi } from './api-client';

export type ReceivedCapsulesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: ReceivedCapsule[] };

/**
 * Screen-local data fetching for the Received tab only — not a general
 * data-fetching framework. There is no React Query (or any other cache
 * library) anywhere in this app (confirmed against apps/mobile/package.json
 * before writing this), and `GET /received` is a single, deliberately
 * unpaginated request — adding a caching layer for one fetch-on-mount call
 * would be more machinery than this ticket needs. If a second screen ends
 * up needing the same shape of fetching, that is the signal to extract a
 * shared hook, not this one.
 *
 * `error` carries no message: `receivedApi.list()` can fail for reasons
 * (network, 5xx, auth) this screen has no way to safely summarize, and
 * `ErrorState`'s own contract requires a pre-sanitized string, never a raw
 * error object — so the caller (the screen) supplies fixed, safe copy
 * rather than this hook inventing per-error text.
 */
export function useReceivedCapsules(): { state: ReceivedCapsulesState; retry: () => void } {
  const [state, setState] = useState<ReceivedCapsulesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    receivedApi
      .list()
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', items: res.data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    // Set here, in the event handler, rather than at the top of the effect
    // above (react-hooks/set-state-in-effect forbids the latter) — the
    // initial mount is already covered by useState's own 'loading' default.
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
