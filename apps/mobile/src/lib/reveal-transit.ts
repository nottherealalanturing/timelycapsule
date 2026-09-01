import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Mobile port of `apps/web/src/components/reveal/use-transit.ts` — same
 * ratified timeline (`design/06`'s "Final timeline"), same scalar-driven
 * architecture, same three preserved silences under reduced motion
 * (`07-EXPERIENCE-BIBLE.md` §VI.4: "Silence is timing, not motion... the
 * beats *are* the meaning"). Ported as a manual `requestAnimationFrame`
 * driver rather than Reanimated — the readiness audit's own §14 ticket
 * text explicitly allows either ("port to Reanimated... or a manual frame
 * driver matching the exact TRANSIT/TRANSIT_REDUCED constants verbatim");
 * a plain rAF-driven scalar is simpler to test under Vitest (no worklet
 * runtime to mock) and is architecturally identical to what web itself
 * does — web's own `TransitStage`/`RecordAtRest` recompute plain inline
 * styles from `elapsedMs` on every render, not GPU-composited driven
 * values, so there is no fidelity lost by using the same approach here.
 */
export const TRANSIT = {
  approachEnd: 2000,
  silenceEnd: 2400,
  crossEnd: 2700,
  recedeEnd: 3050,
  emptyFrameEnd: 3250,
  recordEnd: 4100,
  letterEnd: 4700,
  stillnessEnd: 5400,
  stampEnd: 5800,
} as const;

export const TRANSIT_REDUCED = {
  approachEnd: 150,
  silenceEnd: 550,
  crossEnd: 600,
  recedeEnd: 750,
  emptyFrameEnd: 950,
  recordEnd: 1250,
  letterEnd: 1300,
  stillnessEnd: 2000,
  stampEnd: 2150,
} as const;

export type TransitMarks = typeof TRANSIT | typeof TRANSIT_REDUCED;

export interface TransitState {
  elapsedMs: number;
  marks: TransitMarks;
  opened: boolean;
  emptyFrame: boolean;
  done: boolean;
  skip: () => void;
}

/** 0→1 across a segment, clamped — identical to web's own `segment()`. */
export function segment(elapsedMs: number, from: number, to: number): number {
  if (to <= from) return elapsedMs >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (elapsedMs - from) / (to - from)));
}

/**
 * RN's reduced-motion equivalent of web's `useSyncExternalStore(matchMedia)`.
 * Unlike `matchMedia().matches`, `AccessibilityInfo.isReduceMotionEnabled()`
 * is asynchronous — there is no synchronous read available on mount. `known`
 * lets a caller wait for the real answer rather than briefly assuming full
 * motion and having to switch timelines mid-flight; a native bridge call
 * resolves in well under a frame in practice, so gating ceremony start on it
 * is not a perceptible delay, and it is the only way to avoid ever starting
 * the wrong timeline.
 */
export function useReducedMotion(): { known: boolean; reduced: boolean } {
  const [state, setState] = useState({ known: false, reduced: false });

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!cancelled) setState({ known: true, reduced });
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      setState({ known: true, reduced });
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return state;
}

/**
 * Drives the ceremony from one scalar, exactly like web's `useTransit`.
 * `active` should be `false` until the caller knows both (a) whether the
 * capsule was already opened (no replay) and (b) the real reduced-motion
 * preference — starting early risks animating the wrong timeline.
 */
export function useTransit(active: boolean, reduced: boolean, runId = 0): TransitState {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const skipped = useRef(false);

  const [prevRun, setPrevRun] = useState(runId);
  if (runId !== prevRun) {
    setPrevRun(runId);
    setElapsedMs(0);
  }

  const marks = reduced ? TRANSIT_REDUCED : TRANSIT;
  const end = marks.stampEnd;

  useEffect(() => {
    if (!active) return;
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
      ...deriveTransitFlags(elapsedMs, marks),
      skip: () => {
        skipped.current = true;
        setElapsedMs(end);
      },
    }),
    [elapsedMs, marks, end],
  );
}

/**
 * The pure bucket math behind `opened`/`emptyFrame`/`done` — split out so
 * it's directly unit-testable without rendering the hook at all, matching
 * E1.4.11's own precedent for `elapsedAnnouncement` (testing exported pure
 * logic rather than trying to drive a real `requestAnimationFrame` loop
 * through a mocked component render).
 */
export function deriveTransitFlags(elapsedMs: number, marks: TransitMarks): { opened: boolean; emptyFrame: boolean; done: boolean } {
  return {
    opened: elapsedMs >= marks.crossEnd,
    emptyFrame: elapsedMs >= marks.recedeEnd && elapsedMs < marks.emptyFrameEnd,
    done: elapsedMs >= marks.stampEnd,
  };
}
