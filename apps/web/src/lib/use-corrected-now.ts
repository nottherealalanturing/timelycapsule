'use client';

import { useEffect, useState } from 'react';
import { useServerClockOffsetMs } from './use-server-clock-offset';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Tick only as often as the displayed granularity actually changes. */
function tickIntervalMs(remainingMs: number): number {
  if (remainingMs > DAY) return MINUTE;
  if (remainingMs > HOUR) return 15_000;
  return 1000;
}

/**
 * Server-corrected wall clock, ticking at the granularity the target needs.
 *
 * Extracted from `CountdownDisplay` unchanged — the skew correction against
 * `/system/time` is real business logic (a client with a wrong clock must not
 * see a wrong countdown) and the rebuild preserves it exactly. What changed is
 * only that the value is now supplied to a presentational component instead of
 * being formatted in place.
 *
 * Returns `null` until the first tick, so server and client render the same
 * thing and hydration stays clean.
 */
export function useCorrectedNow(target: Date | null): number | null {
  const offsetMs = useServerClockOffsetMs();
  const [nowMs, setNowMs] = useState<number | null>(null);
  const targetMs = target ? target.getTime() : null;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const corrected = Date.now() + offsetMs;
      setNowMs(corrected);
      const remaining = targetMs === null ? DAY * 2 : targetMs - corrected;
      timer = setTimeout(tick, tickIntervalMs(remaining));
    }
    // Deferred even for the first tick — an effect body must not call setState
    // synchronously (react-hooks/set-state-in-effect).
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [targetMs, offsetMs]);

  return nowMs;
}
