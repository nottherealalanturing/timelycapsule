import { cn } from './cn';

const HOUR = 3_600_000;
const FIFTY_YEARS = 50 * 365.25 * 24 * HOUR;

const LOG_NEAR = Math.log(HOUR);
// Calibration pass (post-T-22 web polish): was 10 years, which clamped every
// capsule 10 years or longer to the identical marker position and
// temperature — a 10yr, 20yr and 50yr capsule were pixel-indistinguishable,
// even though the product's own scheduling engine allows up to 50 years
// (01-PRODUCT.md, scheduling engine spec). Raised to match that real,
// documented maximum rather than an arbitrary round number. Still strictly
// logarithmic — only the far anchor moved, LOG_NEAR is untouched, and the
// "log rather than linear" argument above is unaffected. See the session's
// calibration report for the full before/after table across 1 day–50 years.
const LOG_FAR = Math.log(FIFTY_YEARS);

/**
 * Distance from the line, 0 (at transit) → 1 (far out), on a log scale.
 *
 * Absolute, not proportional. This is the whole argument of `03 §V.2`: a
 * proportion is progress — it has an origin, it fills, it implies a job half
 * done. A capsule is never 30% done. It is three years out. So position is
 * measured as *time-distance from the meridian* and nothing else, which means
 * two capsules three years out sit in the same place whether the wait was
 * three years or thirty.
 *
 * Log rather than linear because the felt difference between ten years and
 * nine is nearly nothing, while the difference between two days and one is
 * enormous — a linear axis would park every long capsule at the far edge and
 * show no movement for years, failing `03 §V.5`.
 */
export function approachDistance(remainingMs: number): number {
  if (remainingMs <= 0) return 0;
  const t = (Math.log(remainingMs) - LOG_NEAR) / (LOG_FAR - LOG_NEAR);
  return Math.min(1, Math.max(0, t));
}

/**
 * Temperature step 1–6 against the ramp in `tokens.css`.
 *
 * Cold steel far out, brass at the approach. Keyed to distance, so temperature
 * is a reading of *imminence* rather than of elapsed proportion — the quality
 * `03 §V.5` asks to be visibly different after six months away.
 */
export function approachTemperature(remainingMs: number): 1 | 2 | 3 | 4 | 5 | 6 {
  const step = Math.round((1 - approachDistance(remainingMs)) * 5) + 1;
  return Math.min(6, Math.max(1, step)) as 1 | 2 | 3 | 4 | 5 | 6;
}

export interface MeridianApproachProps {
  remainingMs: number;
  /** Graduation count. Fewer on small surfaces — these are instrument marks, not decoration. */
  graduations?: number;
  className?: string;
}

/**
 * **The Meridian** — signature device 5 (`07 §III`), here as "the axis of the
 * waiting screen".
 *
 * A capsule approaching the line it will one day cross (`02 §III`). The strong
 * rule on the right *is* the meridian — the instant of transit, held by the
 * institution and never moving. The marker is the capsule, warming as it
 * closes.
 *
 * Deliberately **not** a progress bar (`03 §V.2`, banned outright): there is no
 * track, no fill, and no origin. Nothing accumulates. The only thing that
 * exists is a destination and a distance from it, which is why the same data
 * reads as *on its way* rather than *incomplete*.
 *
 * `aria-hidden` on purpose. `07 §V.4` requires state to be stated in text, not
 * only in colour, position or motion — the literal date and the Dual Clock
 * beside this carry the meaning, and this carries the feeling. It also honours
 * the ramp's hard rule (`05 §Two rules`): the temperature colours a marker and
 * a rule, never text, and never a text-bearing surface.
 *
 * Static. It moves only because `remainingMs` moves, at the tick granularity
 * the caller chose — no animation, nothing that could read as loading
 * (`07 §XVI`).
 */
export function MeridianApproach({ remainingMs, graduations = 12, className }: MeridianApproachProps) {
  const distance = approachDistance(remainingMs);
  const temp = approachTemperature(remainingMs);
  // Distance 1 (far) sits at the start of the scale, 0 (transit) meets the
  // line. Floored at 1.5% so a capsule at or beyond the far end of the scale
  // still reads as a whole marker rather than a half one clipped by the frame.
  const markerLeft = `${Math.max(1.5, (1 - distance) * 100)}%`;

  return (
    <div aria-hidden className={cn('relative h-6 w-full', className)}>
      {/* The approach: a hairline graduation scale, per 04 §7 "hairlines are instrument graduations". */}
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
        {Array.from({ length: graduations }, (_, i) => (
          <span key={i} className="h-2 w-px bg-[var(--color-rule)]" />
        ))}
      </div>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-rule)]" />

      {/* The capsule, at its distance from the line. */}
      <span
        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[1px]"
        style={{ left: markerLeft, backgroundColor: `var(--i-temp-${temp})` }}
      />

      {/* The meridian itself — the line held still, the one the capsule crosses. */}
      <span className="absolute right-0 top-0 h-full w-px bg-[var(--color-rule-strong)]" />
    </div>
  );
}
