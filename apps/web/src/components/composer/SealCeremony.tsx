'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The seal ceremony — the creator's signature moment.
 *
 * ── What this replaces ────────────────────────────────────────────────
 * V1 animated a gold disc with `scale: [0, 1.15, 1]` and
 * `rotate: [-30, 8, 0]` on `easeOut`. Every one of those is banned:
 * overshoot and bounce outright (`07 §VI.1` — materials in an instrument do
 * not bounce), and easing out into completion (`07 §VI.2`). It also drew a
 * ✦ badge, which depicts (`07 §II.3`), and it could not be skipped, which
 * Interaction Constitution 5 requires of every ceremony.
 *
 * ── The held beat ─────────────────────────────────────────────────────
 * Sealing is the most irreversible act in the product, so it gets the full
 * tier (`07 §VI`), in three mandatory parts:
 *
 *   1. APPROACH  900ms, **constant velocity**. Never eases out — easing out
 *      anticipates arrival, and the point is that arrival is not yet.
 *   2. HOLD      400ms of total stillness. Nothing moves. This is the beat
 *      most likely to be "fixed" by someone who thinks the page froze.
 *   3. SEALED    an instant state change, not a tween. A seal is either
 *      intact or it isn't.
 *
 * Orchestrated with rAF rather than a CSS transition because a dead stop
 * cannot be expressed as one, and rather than framer-motion because Gate 1
 * proved a single timeline scalar is enough (`06 §Implementation`).
 *
 * ── What is actually depicted ─────────────────────────────────────────
 * The meridian is *struck* outward from the appointed point — the date
 * becoming fixed and unalterable — and only then does the marker appear,
 * solid, at the start of its journey. It deliberately does **not** show the
 * marker arriving: sealing begins the wait, it does not end it.
 *
 * This is the Transit **motif**, not the mark, so brass is correct here —
 * brass means waiting, and waiting is exactly what starts (`design/brand/
 * IDENTITY.md §5`).
 */

const APPROACH_MS = 900;
const HOLD_MS = 400;
const REST_MS = 700;

type Phase = 'approach' | 'hold' | 'sealed';

export function SealCeremony({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('approach');
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  // Mirrored so the timeline effect does not restart when the parent
  // re-renders with a fresh callback identity.
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  /** Ceremony is skippable at any point, without penalty (`07 §V.5`). */
  const skip = useCallback(() => {
    setPhase('sealed');
    setProgress(1);
    finish();
  }, [finish]);

  useEffect(() => {
    if (!open) return;
    doneRef.current = false;

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Movement collapses under reduced motion; the HOLD does not. The
    // silences are timing rather than motion and carry the meaning
    // (`07 §VI.3`).
    const approach = reduced ? 0 : APPROACH_MS;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t0 = 0;

    /*
     * The timeline runs on timers; rAF only smooths the approach.
     *
     * requestAnimationFrame is paused entirely in a background tab. Driving
     * the phase changes from the rAF loop meant that switching tabs mid-seal
     * left the ceremony frozen and `onDone` never firing — stranding the user
     * on a full-screen overlay *after* the seal had already succeeded on the
     * server. Timers keep running (throttled) when hidden, so every milestone
     * is guaranteed to land whether or not a frame is ever painted.
     */
    function paint(now: number) {
      const t = now - t0;
      if (t >= approach) return; // milestones own the end state, not this
      setProgress(t / approach); // linear — no easing function at all
      raf = requestAnimationFrame(paint);
    }

    // Deferred even for the reset — an effect body must not call setState
    // synchronously (react-hooks/set-state-in-effect), the same pattern
    // `useCorrectedNow` uses for its first tick.
    timers.push(
      setTimeout(() => {
        setPhase('approach');
        setProgress(0);
        t0 = performance.now();
        if (approach > 0) raf = requestAnimationFrame(paint);

        timers.push(
          setTimeout(() => {
            setProgress(1);
            setPhase('hold');
          }, approach),
          setTimeout(() => {
            setPhase('sealed'); // instant, not a tween
          }, approach + HOLD_MS),
          setTimeout(finish, approach + HOLD_MS + REST_MS),
        );
      }, 0),
    );

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, finish, skip]);

  if (!open) return null;

  // The meridian is struck outward from the appointed point.
  const reach = 42 * progress;
  const upperTop = 60 - reach;
  const lowerBottom = 80 + reach;
  const sealed = phase === 'sealed';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sealing capsule"
      onClick={skip}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-8 bg-[var(--color-bg-primary)]"
    >
      <svg width="220" height="140" viewBox="0 0 220 140" fill="none" aria-hidden>
        {/* The appointed moment, struck outward at constant velocity. */}
        <path
          d={`M110 ${upperTop}V60M110 80V${lowerBottom}`}
          stroke="var(--color-accent-gold)"
          strokeWidth="5"
        />
        {/* The capsule, appearing solid only once the seal is struck. */}
        {sealed ? <circle cx="50" cy="70" r="11" fill="var(--color-accent-gold)" /> : null}
      </svg>

      {/* Reserved at all times so nothing reflows when the word lands. */}
      <p
        aria-live="polite"
        className="h-7 text-[length:var(--text-title-s)] leading-[var(--lh-heading)] text-foreground"
      >
        {sealed ? 'Sealed.' : ''}
      </p>
    </div>
  );
}
