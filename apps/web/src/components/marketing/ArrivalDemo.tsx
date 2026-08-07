'use client';

import { Button, DurationStamp, Hallmark, Record } from '@tc/ui-web';
import { useState } from 'react';
import { TransitStage } from '../reveal/TransitStage';
import { TRANSIT_END, useTransit } from '../reveal/use-transit';

/**
 * Section 6 — **What arrives**.
 *
 * The payoff, and the only place paper appears on the landing page.
 *
 * This runs the *real* transit: `useTransit` and `TransitStage`, imported
 * unmodified from the reveal, on Gate 1's ratified timeline. The instrument
 * clears, the frame holds empty for 200ms, and only then does the record
 * arrive. Nothing here reimplements the sequence — a marketing copy of it
 * would drift from `06`, and the empty frame is precisely the beat a
 * reimplementation would "tidy away".
 *
 * ── Why replaying is allowed here and nowhere else ────────────────────
 * Interaction Constitution 6 says ceremony never repeats: returning to an
 * opened capsule shows the record at rest. That governs a capsule someone
 * *owns*. A stranger owns nothing yet, and `07 §X` requires the page to show
 * rather than describe — so the demonstration is replayable, and the product
 * remains not.
 *
 * `07 §II.7` — "the moment belongs to the recipient" — forbids us being
 * present at a real reveal. It does not forbid showing a stranger what one
 * looks like.
 */
export function ArrivalDemo() {
  const [runId, setRunId] = useState(0);
  const [active, setActive] = useState(false);
  const transit = useTransit(active, runId);

  const finished = active && transit.elapsedMs >= TRANSIT_END;

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-primary)]">
        <TransitStage
          key={runId}
          transit={transit}
          publicId="84KZQM3P"
          className="min-h-[26rem] py-12"
        >
          {/* `TransitStage` renders bare children — the caller supplies the
              paper. Without this wrapper the letter arrives in the *instrument*
              register and the register change, which is the entire point of the
              section, silently does not happen. `RevealCeremony` wraps the same
              way. */}
          <Record as="article" className="flex flex-col gap-4">
            <p>I am writing this the week we moved in, while every box is still sealed except the kettle&rsquo;s.</p>
            <p>
              You wanted to know what this place felt like before it became ordinary to us. It smelled of paint.
              We ate on the floor. It was already home.
            </p>
            <footer className="mt-4">
              <DurationStamp elapsedMs={(3 * 365.25 + 2 * 30.44 + 6) * 24 * 3_600_000} />
            </footer>
          </Record>
        </TransitStage>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant={active ? 'secondary' : 'primary'}
          onClick={() => {
            // `runId` rewinds the timeline (see `useTransit`). No toggle-off
            // and no rAF hop: that pattern never fired in a backgrounded tab.
            setRunId((n) => n + 1);
            setActive(true);
          }}
        >
          {active ? 'Play again' : 'Watch it arrive'}
        </Button>
        <span className="text-[length:var(--text-body-s)] text-secondary">
          {finished
            ? 'The instrument cleared, the frame held empty, then the record arrived.'
            : 'Three seconds of it are silence.'}
        </span>
      </div>

      <Hallmark>Real transition · not a video</Hallmark>
    </div>
  );
}
