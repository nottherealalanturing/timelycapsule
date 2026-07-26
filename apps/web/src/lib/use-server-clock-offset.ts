'use client';

import { useQuery } from '@tanstack/react-query';
import { systemApi } from './api-client';

/**
 * Countdowns must not trust the visitor's local clock (02-UX-DESIGN.md §5.4:
 * "/system/time offset sync") — a device with a wrong clock would show a
 * countdown that's wrong by exactly that much. Fetched once and cached for
 * the session; a few seconds of round-trip latency error is immaterial for
 * a countdown measured in days/hours.
 */
export function useServerClockOffsetMs(): number {
  const { data } = useQuery({
    queryKey: ['system-time-offset'],
    queryFn: async () => {
      const before = Date.now();
      const { serverTime } = await systemApi.time();
      const after = Date.now();
      const roundTripMs = after - before;
      return new Date(serverTime).getTime() + roundTripMs / 2 - after;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? 0;
}
