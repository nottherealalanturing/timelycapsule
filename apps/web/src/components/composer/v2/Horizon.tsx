'use client';

import { approachTemperature, cn } from '@tc/ui-web';
import { useState } from 'react';
import { gapPhrase, type HorizonChoice } from '../../../lib/horizons';
import { zoneOffsetLabel } from '../../../lib/zoned-time';
import { zoneChoice } from '../../../lib/zones';

export interface HorizonProps {
  now: Date;
  selected: Date | null;
  candidates: HorizonChoice[];
  onSelect: (at: Date) => void;
  tz: string;
  recipientLocal?: boolean;
  /** Age the recipient will be at the selected moment, where a birthday is known. */
  ageAtUnlock?: number | null;
  recipientName?: string | null;
  className?: string;
}

const DAY_MS = 24 * 3600_000;
const FIFTY_YEARS_MS = 50 * 365.25 * DAY_MS;
const LOG_NEAR = Math.log(DAY_MS);
const LOG_FAR = Math.log(FIFTY_YEARS_MS);

/**
 * Position along the line, as a percentage from the far end.
 *
 * Deliberately **not** `approachDistance`, and this is the one place the two
 * instruments disagree. That function anchors its near end at one hour, which
 * is right for the waiting screen — a capsule an hour from transit is the most
 * interesting thing on that screen and deserves the resolution. But nobody
 * *chooses* an hour. Composing, the realistic range is a day to fifty years,
 * and borrowing the waiting scale crushed everything from five months to
 * twenty-five years into the leftmost third of the line, which defeats the only
 * thing the line is here to do: show how far apart these moments are.
 *
 * Same geometry, same log character, same meridian on the right. Only the near
 * anchor moves, from an hour to a day, because the question is different:
 * *how far is this?* rather than *how far has it come?*
 */
function positionOf(now: Date, at: Date): number {
  const remaining = at.getTime() - now.getTime();
  if (remaining <= 0) return 100;
  const t = (Math.log(remaining) - LOG_NEAR) / (LOG_FAR - LOG_NEAR);
  const pct = Math.max(1.5, (1 - Math.min(1, Math.max(0, t))) * 100);
  // Rounded because `now` is captured once on the server and again on the
  // client, and the difference between those two moments made the inline
  // `left` differ in its final decimals — a hydration mismatch on every
  // candidate. A tenth of a percent is well under a pixel here, and the log
  // scale makes the drift from a few seconds of SSR delay smaller than 1e-4%
  // even for the nearest horizon, so this is exact rather than merely close.
  return Math.round(pct * 10) / 10;
}

/**
 * **The Horizon** — choosing when a message belongs.
 *
 * Not a date picker with decoration. A date picker is the right tool for
 * editing a timestamp and the wrong one for this decision, because it asks
 * someone holding an intention — *when she's grown*, *the next time the year
 * turns* — to convert it into arithmetic before they can express it. Here the
 * candidates are moments with meaning and the arithmetic is ours to do.
 *
 * The line itself is `MeridianApproach`'s geometry made selectable: the strong
 * rule on the right is the meridian, the instant of transit, and distance from
 * it is logarithmic for the reason given there — the felt difference between
 * nine years and ten is nearly nothing, while one day and two is enormous.
 * Ghost marks show where every candidate falls, so the choice is made while
 * seeing how far apart these moments actually are, which is the one thing a
 * list of dates cannot show.
 *
 * Deliberately **not** draggable. On a log scale a few pixels at the far end is
 * several years, so scrubbing would be imprecise exactly where precision is
 * least recoverable — and a line you drag along reads as a progress bar, which
 * `03 §V.2` bans outright. The line reads; the choices decide; the exact
 * controls beneath handle everything they do not cover.
 *
 * `aria-hidden` on the graphic, per `07 §V.4`: the state is carried by the
 * reading below it, never by position or colour alone.
 */
export function Horizon({
  now,
  selected,
  candidates,
  onSelect,
  tz,
  recipientLocal = false,
  ageAtUnlock,
  recipientName,
  className,
}: HorizonProps) {
  const [previewing, setPreviewing] = useState<string | null>(null);

  const previewed = candidates.find((c) => c.id === previewing) ?? null;
  const shown = previewed?.at ?? selected;
  const temperature = shown ? approachTemperature(shown.getTime() - now.getTime()) : 1;

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div aria-hidden className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="h-2 w-px bg-[var(--color-rule)]" />
          ))}
        </div>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-rule)]" />

        {/* Every candidate, so the distances between them are visible. */}
        {candidates.map((c) => (
          <span
            key={c.id}
            className={cn(
              'absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2',
              previewing === c.id ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-rule-strong)]',
            )}
            style={{ left: `${positionOf(now, c.at)}%` }}
          />
        ))}

        {/* The capsule, at its distance from the line. */}
        {shown ? (
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[1px]"
            style={{ left: `${positionOf(now, shown)}%`, backgroundColor: `var(--i-temp-${temperature})` }}
          />
        ) : null}

        {/* The meridian — the line held still, the one the capsule crosses. */}
        <span className="absolute right-0 top-0 h-full w-px bg-[var(--color-rule-strong)]" />
      </div>

      <Reading
        now={now}
        at={shown}
        tz={tz}
        recipientLocal={recipientLocal}
        ageAtUnlock={previewed ? null : ageAtUnlock}
        recipientName={recipientName}
      />

      <ul className="flex flex-col gap-px">
        {candidates.map((c) => {
          const isSelected = selected !== null && Math.abs(selected.getTime() - c.at.getTime()) < 60_000;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(c.at)}
                onMouseEnter={() => setPreviewing(c.id)}
                onMouseLeave={() => setPreviewing(null)}
                onFocus={() => setPreviewing(c.id)}
                onBlur={() => setPreviewing(null)}
                className={cn(
                  'flex w-full items-baseline justify-between gap-4 rounded-[var(--radius-input)] px-3 py-2.5 text-left',
                  'hover:bg-[var(--color-bg-raised)]',
                  isSelected && 'bg-[var(--color-bg-raised)]',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'text-[length:var(--text-body-s)]',
                      isSelected ? 'text-foreground' : 'text-foreground',
                    )}
                  >
                    {c.label}
                  </span>
                  {c.note ? (
                    <span className="text-[length:var(--text-caption)] text-secondary">{c.note}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)] tabular-nums text-secondary">
                  {c.at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * What has been chosen, stated.
 *
 * The absolute date is always present and always first in weight — `07 §VIII.4`
 * permits a relative phrase to accompany a date and never to replace one. The
 * age line is the arithmetic `07 §IX` calls the most affecting we can perform,
 * and it is the reason to choose one moment over another.
 */
function Reading({
  now,
  at,
  tz,
  recipientLocal,
  ageAtUnlock,
  recipientName,
}: {
  now: Date;
  at: Date | null;
  tz: string;
  recipientLocal: boolean;
  ageAtUnlock?: number | null;
  recipientName?: string | null;
}) {
  if (!at) {
    return (
      <p aria-live="polite" className="text-[length:var(--text-body-s)] text-secondary">
        No moment chosen yet.
      </p>
    );
  }

  const date = at.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  });
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  return (
    <div aria-live="polite" className="flex flex-col gap-1.5">
      <p className="font-[var(--font-mono)] text-[length:var(--text-body-s)] tabular-nums text-foreground">
        {date} · {time}
      </p>
      <p className="font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary">
        {recipientLocal ? "Wherever they are · exact instant set when they're known" : `${zoneChoice(tz).city} · ${zoneOffsetLabel(at, tz)}`}
      </p>
      {/* Not coloured with the ramp. `05 §Two rules` restricts temperature to a
          marker and a rule — never text, never a text-bearing surface — and
          the arithmetic carries its own weight without help. */}
      <p className="text-[length:var(--text-body-s)] text-foreground">
        {gapPhrase(now.getTime(), at.getTime())}
        {ageAtUnlock !== null && ageAtUnlock !== undefined && recipientName ? (
          <> {recipientName} will be {ageAtUnlock}.</>
        ) : null}
      </p>
    </div>
  );
}
