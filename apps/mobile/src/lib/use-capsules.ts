import type { CapsuleListItem } from '@tc/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { capsulesApi } from './api-client';

export type CapsulesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: CapsuleListItem[]; nextCursor: string | null; nextPageError: boolean };

/**
 * Screen-local data fetching + cursor pagination for the Home tab — same
 * shape/reasoning as `use-received-capsules.ts` and `use-capsule-detail.ts`:
 * no React Query anywhere in this app, and one paginated list keyed by
 * nothing but "the current user" doesn't need a caching layer of its own.
 *
 * Fetches exactly once on mount (the final readiness audit's explicit
 * warning: `/capsules` has no backend rate limit, so a screen must not
 * refetch on every render/focus without being asked to — this hook has no
 * focus listener and no polling, matching that constraint). `loadMore()`
 * is the only way a second request happens, and `loadingMoreRef` (not
 * state, so it's readable synchronously across rapid calls) makes a
 * concurrent second call while one is already in flight a no-op, which is
 * what prevents onEndReached's well-known "fires multiple times in a row"
 * behavior from producing duplicate requests.
 *
 * A failed next-page request sets `nextPageError` on the existing `ready`
 * state rather than replacing it with `{status:'error'}` — already-loaded
 * capsules must stay on screen; only the list's own footer should show
 * anything went wrong. Calling `loadMore()` again (e.g. the user scrolls
 * back to the end, or taps a footer retry control) is the retry — the
 * cursor from the last successful page is preserved untouched by a failed
 * attempt, so nothing about it needs to change to try again.
 */
export function useCapsules(): { state: CapsulesState; retry: () => void; loadMore: () => void } {
  const [state, setState] = useState<CapsulesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    capsulesApi
      .list()
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', items: res.data, nextCursor: res.nextCursor, nextPageError: false });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || state.nextCursor === null || loadingMoreRef.current) return;
    const cursor = state.nextCursor;
    loadingMoreRef.current = true;
    capsulesApi
      .list({ cursor })
      .then((res) => {
        loadingMoreRef.current = false;
        setState((prev) =>
          prev.status === 'ready'
            ? { status: 'ready', items: [...prev.items, ...res.data], nextCursor: res.nextCursor, nextPageError: false }
            : prev,
        );
      })
      .catch(() => {
        loadingMoreRef.current = false;
        setState((prev) => (prev.status === 'ready' ? { ...prev, nextPageError: true } : prev));
      });
  }, [state]);

  return { state, retry, loadMore };
}
