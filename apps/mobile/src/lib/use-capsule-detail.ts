import type { Capsule } from '@tc/contracts';
import { useCallback, useEffect, useState } from 'react';
import { capsulesApi } from './api-client';

export type CapsuleDetailFetchState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; capsule: Capsule };

/**
 * Screen-local data fetching for the capsule detail screen only — same
 * shape and reasoning as `use-received-capsules.ts`: no React Query
 * anywhere in this app, and this is a single GET keyed by route param, not
 * a case for a caching layer. `error` carries no message for the same
 * reason as that hook's — `capsulesApi.get()` can fail for reasons (404
 * because it's not this user's capsule, network, 5xx) this screen has no
 * way to safely summarize, and the screen's own error copy is fixed, safe
 * text, not a passthrough of whatever the API said.
 */
export function useCapsuleDetail(id: string): { state: CapsuleDetailFetchState; retry: () => void } {
  const [state, setState] = useState<CapsuleDetailFetchState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    capsulesApi
      .get(id)
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', capsule: res.capsule });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
