import { cn } from './cn';

const DAY = 86_400_000;

/**
 * Franked duration, in the postmark's own words: whole units, spelled out,
 * past tense. `04 §10.4` fixes the wording — *TRAVELLED 3 YEARS, 2 MONTHS,
 * 6 DAYS* — so this is not `formatDuration`'s two-unit instrument reading.
 * A postmark is read once, by a stranger, possibly in a screenshot; it says
 * the whole span rather than the two largest parts of it.
 */
export function formatFrankedDuration(elapsedMs: number): string {
  const total = Math.max(0, elapsedMs);
  const days = Math.floor(total / DAY);
  const years = Math.floor(days / 365.25);
  const afterYears = days - Math.floor(years * 365.25);
  const months = Math.floor(afterYears / 30.44);
  const remainingDays = Math.floor(afterYears - months * 30.44);

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (remainingDays > 0 || parts.length === 0) parts.push(`${remainingDays} day${remainingDays === 1 ? '' : 's'}`);
  return parts.join(', ');
}

export interface DurationStampProps {
  elapsedMs: number;
  className?: string;
}

/**
 * **The Duration Stamp** — signature device 4 (`07 §III.4`), "the postmark of
 * duration… the only thing we make that is designed to leave the product."
 *
 * Franked at the moment of opening, never during the wait (`04 §10.4`). It is
 * the last thing to arrive in the transit sequence (`06`, 5400–5800ms) because
 * it is the receipt, not the event.
 *
 * **Content-blind by construction** (`07 §XIV`): it takes a duration and
 * nothing else. It cannot leak what a capsule said because it is never given
 * it — the prop signature is the guarantee, not a convention. That is what
 * makes it safe to screenshot, which is the entire point of the object.
 *
 * Mono and uppercase because a postmark is struck, not typeset — and because
 * `03 §VII` makes numerals structural: this has to hold "6 days" and "23
 * years, 11 months, 30 days" with the same authority.
 */
export function DurationStamp({ elapsedMs, className }: DurationStampProps) {
  return (
    <div
      className={cn(
        'inline-flex flex-col gap-1 border border-[var(--color-rule-strong)] px-4 py-3',
        'rounded-[var(--radius-record)]',
        className,
      )}
    >
      <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
        Travelled
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-body-s)] uppercase tracking-[0.08em] tabular-nums text-foreground">
        {formatFrankedDuration(elapsedMs)}
      </span>
    </div>
  );
}
