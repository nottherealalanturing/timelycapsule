import { useEffect, useState } from 'react';

/**
 * A plain, uncorrected `Date.now()` ticking every second while `active` is
 * true. Deliberately simpler than web's `use-corrected-now.ts`, which
 * additionally corrects for server/client clock drift via a fetched
 * server-time offset — PHASE-5.1's readiness audit never scoped that
 * correction layer, and a countdown that's off by a few seconds of local
 * clock drift is a known, disclosed simplification for this ticket, not a
 * silently invented guarantee. Ticks only every second (not every frame) —
 * the locked screen states duration as text, never as an animating
 * instrument (`07-EXPERIENCE-BIBLE.md` §XVI's motion ban applies the same
 * way here as it does to the ring web no longer needs from this hook).
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  return now;
}
