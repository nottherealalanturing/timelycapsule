'use client';

import { DualClock, Hallmark } from '@tc/ui-web';
import { useEffect, useState } from 'react';
import { formatAbsoluteDate } from '../../lib/waiting';

/**
 * The right harbour of the hero — the Dual Clock itself, unhoused, reading
 * against `HeroMeridianSpine`.
 *
 * `07 §X.1` is literal about what opens this page: "The opening should *be* a
 * dual clock — a real duration, moving, with no explanation." No card, no
 * title, no capsule ID — this duration belongs to nobody, and inventing a
 * recipient would be simulating what we can state (`07 §II.8`). `07 §II.2` —
 * the institution never changes, the instruments always do — and a bare
 * reading is an instrument, not a screenshot of a product.
 *
 * The absolute dates sit beneath the figures, because relative time never
 * appears without them (`07 §VIII.4`).
 *
 * **The one-line Hallmark above the figures** is a fresh-eyes correction: every
 * other capsule reading on this page carries a title and a capsule ID (`07 §III`
 * device 3) — this was the sole exception, and a bare pair of numbers with no
 * identity, arriving before any of the page's trust content, read as an
 * unlabeled or broken widget rather than a deliberate opening statement. One
 * plain caption resolves it without reintroducing the card this component
 * exists to not be.
 */
const SEALED_AT = Date.UTC(2026, 0, 1);
const OPENS_AT = Date.UTC(2036, 0, 1);

export function HeroClock() {
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

  return (
    // Height reserved before hydration so the fold never shifts (CLS, and
    // `07 §VI.3` — nothing may read as loading, including a jump).
    <div className="flex min-h-[13rem] flex-col justify-center gap-3">
      <Hallmark>A capsule, mid-wait</Hallmark>
      {nowMs === null ? (
        <div aria-hidden className="h-[8rem]" />
      ) : (
        <div className="flex flex-col gap-6">
          <DualClock
            size="lg"
            elapsedMs={nowMs - SEALED_AT}
            remainingMs={Math.max(0, OPENS_AT - nowMs)}
            emphasis="equal"
          />
          <p className="border-t border-[var(--color-rule)] pt-4 text-[length:var(--text-body-s)] text-secondary">
            Sealed {formatAbsoluteDate(new Date(SEALED_AT).toISOString())} &middot; opens{' '}
            {formatAbsoluteDate(new Date(OPENS_AT).toISOString())}
          </p>
        </div>
      )}
    </div>
  );
}
