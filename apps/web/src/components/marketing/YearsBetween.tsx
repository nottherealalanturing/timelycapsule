'use client';

import { DualClock, Hallmark, MeridianApproach, StateChip } from '@tc/ui-web';
import { useState } from 'react';
import { formatAbsoluteDate } from '../../lib/waiting';

/**
 * Section 5 — **The years between**.
 *
 * Answers the question the previous two sections create: *what does owning
 * this actually feel like for a decade?*
 *
 * `03 §VII`'s acceptance test applies to this section verbatim — "does a
 * sealed capsule sitting untouched for three years look like something
 * valuable is happening, or like nothing is happening?" If it reads as empty,
 * the section has failed, and so has the product's central claim.
 *
 * It is built from the real waiting surface: `MeridianApproach` (the Transit
 * motif), `DualClock`, `StateChip`. The reading below is a capsule three years
 * into a fifteen-year wait — deliberately mid-wait, because that is where a
 * capsule spends almost all of its life.
 *
 * **Position, not progress** (`03 §V.2`). There is no bar filling up here. A
 * capsule is never 30% done; it is three years out.
 *
 * The custody lines are facts about how the system behaves, not features.
 * `07 §XVI` bans streaks, nudges and re-engagement outright, so what is
 * offered instead is the only honest reassurance: *it is being kept, and there
 * is nothing for you to do.*
 */

const DAY = 24 * 3_600_000;
const SEALED_AT = Date.UTC(2026, 2, 14);
const OPENS_AT = Date.UTC(2041, 2, 14);

const CUSTODY: { term: string; detail: string }[] = [
  {
    term: 'Checked, quietly',
    detail:
      'We verify we can still reach your recipient long before it matters — while there is still a living person to ask for a new address.',
  },
  {
    term: 'Nothing to maintain',
    detail: 'No streaks, no check-ins, no reminders to keep it alive. Silence is the normal state.',
  },
  {
    term: 'Yours to take',
    detail: 'Everything you own exports as ordinary files, today, from Settings — not one day, now.',
  },
];

export function YearsBetween() {
  // Fixed instants rather than Date.now(): the reading must be identical on
  // server and client, and this is a portrait of a mid-wait capsule, not a
  // live countdown to anything the visitor owns.
  const [nowMs] = useState(() => SEALED_AT + 3 * 365.25 * DAY);
  const elapsedMs = nowMs - SEALED_AT;
  const remainingMs = OPENS_AT - nowMs;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
      <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Hallmark>84KZQM3P</Hallmark>
            <p className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)]">
              Letter to my daughter
            </p>
          </div>
          <StateChip state="sealed" />
        </div>

        <MeridianApproach remainingMs={remainingMs} />

        <DualClock size="lg" elapsedMs={elapsedMs} remainingMs={remainingMs} />

        <p className="border-t border-[var(--color-rule)] pt-4 text-[length:var(--text-body-s)] text-secondary">
          Sealed {formatAbsoluteDate(new Date(SEALED_AT).toISOString())} &middot; opens{' '}
          {formatAbsoluteDate(new Date(OPENS_AT).toISOString())}
        </p>
      </div>

      <dl className="flex flex-col gap-7">
        {CUSTODY.map((item) => (
          <div key={item.term} className="flex flex-col gap-1.5 border-t border-[var(--color-rule)] pt-4">
            <dt className="text-[length:var(--text-body)] font-medium">{item.term}</dt>
            <dd className="text-[length:var(--text-body-s)] text-secondary">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
