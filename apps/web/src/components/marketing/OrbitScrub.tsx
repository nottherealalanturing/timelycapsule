'use client';

import { DualClock, Hallmark, MeridianApproach, StateChip } from '@tc/ui-web';
import { useState } from 'react';
import { formatAbsoluteDate } from '../../lib/waiting';

/**
 * **The Orbit Scrub** — `07 §X.2`: "Compress the wait. The one place we may
 * accelerate time, because demonstrating a decade is otherwise impossible.
 * This is the Orbit Scrub's real job (`03 §VII`) and the only permitted
 * spectacle in the entire product."
 *
 * A native range input driving a ten-year wait: the visitor drags through the
 * decade and watches the Dual Clock count it, the marker close on the line,
 * and the temperature warm. Native `<input type="range">` deliberately —
 * keyboard- and screen-reader-accessible for free, zero dependencies, and the
 * scrub position is honest state, not an animation (`07 §XVI` bans
 * scroll-jacking and parallax; this moves only when the visitor moves it).
 *
 * The date readout keeps `07 §VIII.4` intact even here: relative time never
 * appears without the literal date beside it.
 */
const TEN_YEARS_MS = 10 * 365.25 * 24 * 3_600_000;
const SEALED_AT = Date.UTC(2026, 0, 1);

export function OrbitScrub() {
  const [t, setT] = useState(0.03);

  const elapsedMs = t * TEN_YEARS_MS;
  const remainingMs = TEN_YEARS_MS - elapsedMs;
  const atDate = new Date(SEALED_AT + elapsedMs);

  return (
    <div className="flex flex-col gap-5">
      {/*
        The scrub drives the *real waiting card*, not a set of floating
        readings: same chrome, same components, same order the app renders
        them in. `07 §X.2` calls this the one permitted spectacle, and it is
        only worth spending if what the visitor moves is a preview of
        ownership rather than a diagram of one.
      */}
      <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Hallmark>9QXA4TFP</Hallmark>
            <p className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)]">Letter to my future self</p>
          </div>
          <StateChip state={remainingMs <= 0 ? 'unlocked' : 'sealed'} />
        </div>
        <MeridianApproach remainingMs={remainingMs} />
        <DualClock size="md" elapsedMs={elapsedMs} remainingMs={remainingMs} />
        <p className="border-t border-[var(--color-rule)] pt-4 text-[length:var(--text-body-s)] text-secondary">
          On {formatAbsoluteDate(atDate.toISOString())}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="orbit-scrub" className="text-[length:var(--text-body-s)] text-secondary">
          Drag to move through the decade
        </label>
        <input
          id="orbit-scrub"
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          onChange={(e) => setT(Number(e.target.value) / 1000)}
          className="tc-scrub w-full"
        />
      </div>
    </div>
  );
}
