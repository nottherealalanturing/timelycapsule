'use client';

import { useEffect, useState } from 'react';
import { useServerClockOffsetMs } from '../lib/use-server-clock-offset';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365.25 * DAY;

function granularTickIntervalMs(remainingMs: number): number {
  if (remainingMs > DAY) return MINUTE;
  if (remainingMs > HOUR) return 1000 * 15;
  return 1000;
}

function formatRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return 'Unlocking…';
  if (remainingMs >= YEAR) {
    const years = Math.floor(remainingMs / YEAR);
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  if (remainingMs >= MONTH) {
    const months = Math.floor(remainingMs / MONTH);
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  if (remainingMs >= DAY) {
    const days = Math.floor(remainingMs / DAY);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (remainingMs >= HOUR) {
    const hours = Math.floor(remainingMs / HOUR);
    const minutes = Math.floor((remainingMs % HOUR) / MINUTE);
    return `${hours}h ${minutes}m`;
  }
  const minutes = Math.floor(remainingMs / MINUTE);
  const seconds = Math.floor((remainingMs % MINUTE) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Adaptive-granularity countdown (years → months → days → h:m → m:s), clock-skew-corrected via /system/time. */
export function CountdownDisplay({ target, className }: { target: Date; className?: string }) {
  const offsetMs = useServerClockOffsetMs();
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const correctedNow = Date.now() + offsetMs;
      setNowMs(correctedNow);
      const remaining = target.getTime() - correctedNow;
      timer = setTimeout(tick, granularTickIntervalMs(remaining));
    }
    // Deferred even for the first tick — an effect body shouldn't call
    // setState synchronously (react-hooks/set-state-in-effect).
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [target, offsetMs]);

  if (nowMs === null) return null;
  return <span className={className}>{formatRemaining(target.getTime() - nowMs)}</span>;
}
