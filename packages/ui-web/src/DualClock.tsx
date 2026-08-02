import { cn } from './cn';
import { Hallmark } from './Hallmark';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365.25 * DAY;

/**
 * Two largest units, always — so the figure never reflows as it counts down.
 *
 * `03 §VII` makes numerals structural rather than cosmetic: the same component
 * has to hold `00:47`, `9 d 4 h` and `2 y 11 m` with equal authority. Pairing
 * the two largest units keeps the string a near-constant width at every
 * magnitude, which is what makes tabular alignment hold.
 */
export function formatDuration(ms: number): string {
  const t = Math.max(0, ms);
  // The month inside a year is a *twelfth of that year*, not a flat 30 days.
  // A 30-day month divides 365.25 days 12.17 times, so the naive remainder
  // renders "9 y 12 m" at the top of a year instead of rolling to "10 y 0 m".
  if (t >= YEAR) return `${Math.floor(t / YEAR)} y ${Math.floor((t % YEAR) / (YEAR / 12))} m`;
  if (t >= MONTH) return `${Math.floor(t / MONTH)} m ${Math.floor((t % MONTH) / DAY)} d`;
  if (t >= DAY) return `${Math.floor(t / DAY)} d ${Math.floor((t % DAY) / HOUR)} h`;
  if (t >= HOUR) return `${Math.floor(t / HOUR)} h ${Math.floor((t % HOUR) / MINUTE)} m`;
  const m = Math.floor(t / MINUTE);
  const s = Math.floor((t % MINUTE) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type ClockEmphasis = 'remaining' | 'equal';

/**
 * Weighting shifts across the life of a capsule.
 *
 * `03 §V.1` requires elapsed and remaining to be shown together, but `09 §XIV.5`
 * found the equal weighting breaks at both ends: on day one of a ten-year wait
 * *"Travelled: 0 days"* against *"Remaining: 3,652 days"* is demoralising — the
 * exact impatience the principle exists to prevent — and in the final hours the
 * distance already travelled is emotionally irrelevant.
 *
 * So both figures are always present and the *emphasis* moves: remaining-led at
 * the start, genuinely equal through the long middle, remaining-led again on
 * the approach. The component becomes an instrument that changes with time,
 * which is `07 §II.2` applied to the thing carrying the most brand.
 */
export function clockEmphasis(elapsedMs: number, remainingMs: number): ClockEmphasis {
  const total = elapsedMs + remainingMs;
  if (total <= 0) return 'remaining';
  const p = elapsedMs / total;
  return p < 0.12 || p > 0.88 ? 'remaining' : 'equal';
}

export interface DualClockProps {
  elapsedMs: number;
  remainingMs: number;
  size?: 'sm' | 'md' | 'lg';
  /** Overrides the derived emphasis. Use only where the surface demands it. */
  emphasis?: ClockEmphasis;
  className?: string;
}

const FIGURE = {
  sm: { lead: 'text-[length:var(--text-body)]', sub: 'text-[length:var(--text-body-s)]', gap: 'gap-5' },
  md: { lead: 'text-[length:var(--text-title-s)]', sub: 'text-[length:var(--text-body)]', gap: 'gap-7' },
  lg: { lead: 'text-[length:var(--text-display-s)]', sub: 'text-[length:var(--text-title-s)]', gap: 'gap-10' },
};

/**
 * **The Dual Clock** — signature device 2 (`07 §III`), and the component that
 * carries more brand than the logo does, because it is on every screen.
 *
 * Elapsed and remaining, together, always. Deliberately *not* a progress bar:
 * `03 §V.2` bans them outright — a progress bar says *this is incomplete and
 * taking too long*, which is the visual grammar of impatience. A capsule is
 * never 30% done. It is three years out.
 *
 * Presentational and pure. The caller supplies the already-corrected instants,
 * so clock-skew correction stays where it belongs, in the app.
 */
export function DualClock({
  elapsedMs,
  remainingMs,
  size = 'md',
  emphasis,
  className,
}: DualClockProps) {
  const weight = emphasis ?? clockEmphasis(elapsedMs, remainingMs);
  const s = FIGURE[size];
  const travelledLead = weight === 'equal';

  return (
    <div className={cn('flex', s.gap, className)}>
      <div className="flex flex-col gap-0.5">
        <Hallmark>Travelled</Hallmark>
        <span
          className={cn(
            'font-[family-name:var(--font-mono)] tabular-nums leading-none',
            travelledLead ? s.lead : s.sub,
            travelledLead ? 'text-foreground' : 'text-secondary',
          )}
        >
          {formatDuration(elapsedMs)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <Hallmark>Remaining</Hallmark>
        <span
          className={cn(
            'font-[family-name:var(--font-mono)] tabular-nums leading-none text-foreground',
            s.lead,
          )}
        >
          {formatDuration(remainingMs)}
        </span>
      </div>
    </div>
  );
}
