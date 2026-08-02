'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/**
 * The transit timeline, exactly as fixed by Gate 1 (`design/06`, "Final
 * timeline"). These are not tunable numbers — they were tested and ratified,
 * and the three silences in particular are the ratified result.
 */
export const TRANSIT = {
  approachEnd: 2000, // marker travels to the meridian, linear
  silenceEnd: 2400, // ── SILENCE. Nothing moves.
  crossEnd: 2700, // transit completes; meridian brightens .42 → .85
  // 2700: the seal opens. An instant state change, never a tween (`06`: `step`).
  recedeEnd: 3050, // instrument recedes: face fades, settles 6px
  emptyFrameEnd: 3250, // ── THE EMPTY FRAME. "The threshold is the empty frame."
  recordEnd: 4100, // record arrives: inset wipe from the meridian
  letterEnd: 4700, // letter, three lines staggered 90ms
  stillnessEnd: 5400, // ── STILLNESS.
  stampEnd: 5800, // duration stamp franks in at 88%
} as const;

export const TRANSIT_END = TRANSIT.stampEnd;

/**
 * Reduced motion keeps every silence and shortens only the moving segments.
 *
 * `07 §VI.4`: "Silence is timing, not motion — so it survives
 * `prefers-reduced-motion`… the beats *are* the meaning, and the reduced-motion
 * version is arguably the purer one." `06`'s reduced-motion note only spells
 * out the 200ms empty frame, leaving the other two silences unaccounted for —
 * an ambiguity resolved here in favour of the stronger rule, §VI.4, which says
 * *all* held beats are preserved.
 */
export const TRANSIT_REDUCED = {
  approachEnd: 150,
  silenceEnd: 550, // 400ms silence, preserved in full
  crossEnd: 600,
  recedeEnd: 750,
  emptyFrameEnd: 950, // 200ms empty frame, preserved in full
  recordEnd: 1250,
  letterEnd: 1300,
  stillnessEnd: 2000, // 700ms stillness, preserved in full
  stampEnd: 2150,
} as const;

export type TransitMarks = typeof TRANSIT | typeof TRANSIT_REDUCED;

export interface TransitState {
  elapsedMs: number;
  marks: TransitMarks;
  /** True once the seal has opened — an instant flip, never interpolated. */
  opened: boolean;
  /** The instrument is gone and the record has not yet arrived. The threshold. */
  emptyFrame: boolean;
  done: boolean;
  skip: () => void;
}

/**
 * Drives the whole reveal from **one scalar**, per `06 §Implementation`:
 * "Drive from a single timeline scalar (0→1), not chained transitions — that
 * is what makes it scrubbable, interruptible and skippable for free."
 *
 * CSS does the animating; this only reports where we are. `06` is explicit
 * that "the whole sequence is `clip-path`, opacity and transform driven by one
 * scalar… GSAP is not needed for the reveal", and `07 §VI.8` makes CSS the
 * default unless proven otherwise. V1 used framer-motion here, which is what
 * made the sequence unskippable and impossible to hold still.
 */
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * @param runId Bump to replay. A run's origin belongs to the *run*, not to the
 *   mount: without this, a second run inherited the first run's start time, so
 *   `now - startedAt` was already past the end on frame one and the entire
 *   ceremony — including all three silences — was skipped. Call sites tried to
 *   solve it by keying `TransitStage` and toggling `active` across a
 *   `requestAnimationFrame`, but the timeline lives here, not in that
 *   component, so the ref survived both. (The rAF hop had a second failure
 *   mode: it never fires in a backgrounded tab, so the replay silently never
 *   started at all.)
 */
export function useTransit(active: boolean, runId = 0): TransitState {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const skipped = useRef(false);

  // Reset during render rather than in an effect, so the rewind is committed
  // in the same paint that changes `runId` — an effect would leave one frame
  // showing the finished record before the instrument reappears.
  const [prevRun, setPrevRun] = useState(runId);
  if (runId !== prevRun) {
    setPrevRun(runId);
    setElapsedMs(0);
  }

  // A media query is an external store, so it is read as one rather than
  // mirrored into state from an effect. Server snapshot is `false` so the
  // markup matches on hydration; a reduced-motion user gets the reduced
  // timeline on the first client render, before the sequence starts.
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );

  const marks = reduced ? TRANSIT_REDUCED : TRANSIT;
  const end = marks.stampEnd;

  useEffect(() => {
    if (!active) return;
    // Per-run origin. Cleared here so every activation — first or replay —
    // starts the timeline at zero.
    startedAt.current = null;
    skipped.current = false;
    let raf = 0;
    function frame(now: number) {
      if (startedAt.current === null) startedAt.current = now;
      const next = skipped.current ? end : now - startedAt.current;
      setElapsedMs(Math.min(next, end));
      if (next < end) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, end, runId]);

  return useMemo(
    () => ({
      elapsedMs,
      marks,
      opened: elapsedMs >= marks.crossEnd,
      emptyFrame: elapsedMs >= marks.recedeEnd && elapsedMs < marks.emptyFrameEnd,
      done: elapsedMs >= end,
      skip: () => {
        skipped.current = true;
      },
    }),
    [elapsedMs, marks, end],
  );
}

/** 0→1 across a segment, clamped. The only interpolation in the sequence. */
export function segment(elapsedMs: number, from: number, to: number): number {
  if (to <= from) return elapsedMs >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (elapsedMs - from) / (to - from)));
}
