'use client';

import { approachDistance, approachTemperature } from '@tc/ui-web';
import { useEffect, useState } from 'react';

const SEALED_AT = Date.UTC(2026, 0, 1);
const OPENS_AT = Date.UTC(2036, 0, 1);
const GRADUATIONS = 12;

/**
 * The Meridian, built as the hero's structural spine rather than as the small
 * inline instrument every waiting card below it uses.
 *
 * Every card-based section on this page — §2's Orbit Scrub, §5's portrait, §6's
 * arrival — bounds the Meridian inside a card, at instrument scale. That
 * repetition was the thing to fix, not the device: putting it at architectural
 * scale, as the literal divider between what you are told and what you are
 * shown, is still "behave, don't depict" (`07 §II.3`) — it is the same reading,
 * `approachDistance`/`approachTemperature`, the same functions the real waiting
 * screen calls, laid out full-height instead of in a 24px strip. Nothing here
 * is drawn to look like a meridian; it *is* the axis the layout turns on.
 *
 * `aria-hidden` throughout, exactly as `MeridianApproach` is: `07 §V.4`
 * requires state to exist in text, and the Dual Clock beside this spine
 * carries it. This carries the feeling, not the fact.
 */
export function HeroMeridianSpine() {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    // Deferred first tick — an effect body must not setState synchronously.
    const first = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const remainingMs = nowMs === null ? OPENS_AT - SEALED_AT : Math.max(0, OPENS_AT - nowMs);
  const distance = approachDistance(remainingMs);
  const temp = approachTemperature(remainingMs);
  // Far (distance 1) sits at the top of the spine; the line's own foot is the
  // meridian itself, so the marker closes downward as the wait shortens —
  // the same "approach, don't arrive" reading as the horizontal instrument,
  // rotated to run with the page instead of across a card.
  const markerTop = `${Math.min(96, (1 - distance) * 100)}%`;

  return (
    <div aria-hidden className="relative hidden h-full w-full lg:block">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--color-rule-strong)]" />
      {Array.from({ length: GRADUATIONS }, (_, i) => (
        <span
          key={i}
          className="absolute left-1/2 h-px w-3 -translate-x-1/2 bg-[var(--color-rule)]"
          style={{ top: `${(i / (GRADUATIONS - 1)) * 100}%` }}
        />
      ))}
      {nowMs !== null ? (
        <span
          className="absolute left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[1px]"
          style={{ top: markerTop, backgroundColor: `var(--i-temp-${temp})` }}
        />
      ) : null}
    </div>
  );
}
