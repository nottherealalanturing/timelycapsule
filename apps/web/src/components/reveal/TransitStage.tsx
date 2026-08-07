'use client';

import { Hallmark, cn } from '@tc/ui-web';
import type { ReactNode } from 'react';
import { segment, type TransitState } from './use-transit';

/**
 * The crossing, and the register change it carries.
 *
 * This is the one moment `05` permits a register change at all — "The register
 * change must stay rare. At transit and almost nowhere else." Everything else
 * in the product is instrument; this is where paper arrives.
 *
 * The sequence is `06`'s ratified timeline and its three constraints:
 *
 * 1. **Registers never overlap in time** (`06`, `07 §VI.7`). The instrument
 *    clears, the frame holds *empty*, and only then does the record arrive.
 *    Never a crossfade. The `Record` primitive guarantees the record is an
 *    object rather than a background; the sequencing rule is this component's
 *    job, and it is enforced structurally below — the record is not rendered
 *    at all until the empty frame has elapsed, so no crossfade is even
 *    expressible here.
 * 2. **The threshold is the empty frame**, not the paper's arrival (`06`).
 *    Those 200ms are the protected beat — the held breath — and are the reason
 *    the whole thing reads as a threshold instead of a transition.
 * 3. **Nothing morphs** (`06`). Instrument text is sans and stays sans; the
 *    letter is serif and did not exist before, so it arrives already set. No
 *    text ever crossfades between faces.
 *
 * What holds still, deliberately, while everything else moves: the meridian,
 * the hallmark and the frame (`06 Q2`). `07 §VI.5` — the institution is static.
 */
export function TransitStage({
  transit,
  publicId,
  children,
  className,
}: {
  transit: TransitState;
  publicId: string;
  children: ReactNode;
  /**
   * Overrides the stage's own height. The reveal page owns the whole viewport;
   * the landing page demonstrates the same crossing inside a section. Added so
   * both share ONE implementation of the ratified timeline rather than the
   * marketing site growing a second copy that drifts from `06`.
   */
  className?: string;
}) {
  const { elapsedMs, marks } = transit;

  // The approach: the marker closes on the line at constant velocity. `07
  // §VI.1` — never eases out, because easing out anticipates arrival.
  const approach = segment(elapsedMs, 0, marks.approachEnd);
  // The meridian brightens .42 → .85 as the crossing completes (`06`).
  const meridianOpacity = 0.42 + 0.43 * segment(elapsedMs, marks.silenceEnd, marks.crossEnd);
  // The instrument recedes: fades and settles 6px.
  const recede = segment(elapsedMs, marks.crossEnd, marks.recedeEnd);
  // The record arrives: asymmetric inset wipe from the meridian at 70%.
  const arrive = segment(elapsedMs, marks.emptyFrameEnd, marks.recordEnd);

  const instrumentVisible = elapsedMs < marks.recedeEnd;
  const recordPresent = elapsedMs >= marks.emptyFrameEnd;

  return (
    <div className={cn('relative flex items-center justify-center px-6 py-16', className ?? 'min-h-screen')}>
      {/* The frame holds. It is here in every phase, including the empty one. */}
      <div className="relative w-full max-w-[var(--measure-record)]">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-rule-strong)]"
          style={{ left: '70%', opacity: meridianOpacity }}
        />

        <div className="mb-6 flex justify-between">
          <Hallmark>{publicId}</Hallmark>
          <Hallmark>{transit.opened ? 'Opened' : 'Transit'}</Hallmark>
        </div>

        {instrumentVisible ? (
          <div
            aria-hidden
            className="relative h-40"
            style={{ opacity: 1 - recede, transform: `translateY(${recede * 6}px)` }}
          >
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-rule)]" />
            <span
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-[var(--i-temp-6)]"
              style={{ left: `${2 + approach * 68}%` }}
            />
          </div>
        ) : null}

        {/*
          Rendered only once the empty frame has elapsed. Structural, not
          stylistic: while `recordPresent` is false there is nothing to
          crossfade *with*, so `06`'s no-overlap rule cannot be violated by a
          later change to this file.
        */}
        {recordPresent ? (
          <div
            style={{
              // Asymmetric wipe emanating from the meridian (`06`: 30%→0 / 70%→0).
              clipPath: `inset(0 ${30 * (1 - arrive)}% 0 ${70 * (1 - arrive)}%)`,
              transform: `scale(${0.985 + 0.015 * arrive})`,
              transition: 'none',
            }}
          >
            {children}
          </div>
        ) : (
          <div className="h-40" aria-hidden />
        )}
      </div>
    </div>
  );
}
