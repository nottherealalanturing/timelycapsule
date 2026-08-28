import type { Notification } from '@tc/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from './api-client';

export type NotificationsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Notification[]; nextCursor: string | null; nextPageError: boolean };

/**
 * Screen-local data fetching + cursor pagination for the Notifications
 * tab — identical shape and reasoning to `use-capsules.ts`/
 * `use-received-capsules.ts`/`use-capsule-detail.ts`: no React Query
 * anywhere in this app, and `GET /notifications` has no application-level
 * rate limit (per the E1.3 final readiness audit), so this fetches exactly
 * once on mount — no focus listener, no polling, no pull-to-refresh — and
 * `loadMore()` is the only thing that ever issues a second request.
 *
 * In-app notifications are pull-only (no WebSocket/push exists), so a
 * fresh notification only ever appears the next time this screen mounts,
 * not live — a deliberate, already-documented product characteristic,
 * not a gap this hook should paper over with polling.
 */
export function useNotifications(): { state: NotificationsState; retry: () => void; loadMore: () => void } {
  const [state, setState] = useState<NotificationsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    notificationsApi
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
    notificationsApi
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
