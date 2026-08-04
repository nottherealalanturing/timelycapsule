/**
 * Wall-clock arithmetic against a named IANA zone.
 *
 * The composer stores an **instant** (`unlockAt`, an ISO string). Every control
 * that displays or edits it does so through a chosen zone, and this module is
 * the only place the two representations are converted.
 *
 * Keeping that conversion in one place is the entire point. The previous
 * implementation read values back with `toISOString().slice()` — UTC — while
 * writing them with `setHours()` — the browser's own zone. The field and the
 * summary sentence therefore disagreed by exactly the browser's offset: an hour
 * in Lagos, five and a half in Kolkata, invisible in London. Worse, the zone
 * select never re-anchored anything, so choosing a zone changed what a capsule
 * *claimed* without changing when it would actually open. On a product whose
 * promise is "exactly when you said," that is a correctness bug rather than a
 * formatting one.
 *
 * No date library: `Intl` already carries the full zone database, including
 * historical and future DST rules, and adding a dependency to re-derive what
 * the platform knows would be worse.
 */

export interface WallClock {
  year: number;
  /** 1–12, not the `Date` constructor's 0–11. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** `Intl.DateTimeFormat` construction is expensive enough to be worth caching per zone. */
function formatter(tz: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(tz);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    // h23 rather than `hour12: false` — the latter is specified to produce a
    // 24 o'clock for midnight in some engines, which would silently roll a
    // day forward on every capsule scheduled for 00:00.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  FORMATTERS.set(tz, made);
  return made;
}

function partsOf(instant: Date, tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

/** What a clock hanging in `tz` reads at `instant`. */
export function wallClockIn(instant: Date, tz: string): WallClock {
  const p = partsOf(instant, tz);
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour!, minute: p.minute! };
}

/** `tz`'s offset from UTC at `instant`, in minutes. East of Greenwich is positive. */
export function zoneOffsetMinutes(instant: Date, tz: string): number {
  const p = partsOf(instant, tz);
  const asIfUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  // `asIfUtc` carries no milliseconds, so compare against a whole-second
  // instant or the remainder shows up as a fractional minute of offset.
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return (asIfUtc - wholeSeconds) / 60_000;
}

/**
 * The instant at which a clock in `tz` reads `wall`.
 *
 * Two passes: the offset in effect at the naive guess can differ from the one
 * at the corrected instant when the pair straddles a DST boundary, so the
 * result is settled once more against itself. Wall times that do not exist
 * (the spring-forward gap) or that happen twice (the autumn repeat) resolve to
 * a single defensible instant rather than throwing — a capsule must always have
 * exactly one moment it opens at.
 */
export function instantFrom(wall: WallClock, tz: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let ms = naive - zoneOffsetMinutes(new Date(naive), tz) * 60_000;
  ms = naive - zoneOffsetMinutes(new Date(ms), tz) * 60_000;
  return new Date(ms);
}

/**
 * Move an instant into a different zone, keeping the wall clock the person
 * chose.
 *
 * "09:00 in Lagos" and "09:00 in New York" are different instants, and picking
 * a zone is a statement about which one is meant. The reading stays; the moment
 * moves.
 */
export function reanchor(instant: Date, fromTz: string, toTz: string): Date {
  return instantFrom(wallClockIn(instant, fromTz), toTz);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` as `<input type="date">` wants it, read in `tz`. */
export function dateInputValue(instant: Date, tz: string): string {
  const w = wallClockIn(instant, tz);
  return `${String(w.year).padStart(4, '0')}-${pad2(w.month)}-${pad2(w.day)}`;
}

/** `HH:mm` as `<input type="time">` wants it, read in `tz`. */
export function timeInputValue(instant: Date, tz: string): string {
  const w = wallClockIn(instant, tz);
  return `${pad2(w.hour)}:${pad2(w.minute)}`;
}

/** Parses the pair an `unlockLocal` record stores, or the two inputs, into a wall clock. */
export function parseWallClock(date: string, time: string): WallClock | null {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => n === undefined || Number.isNaN(n))) return null;
  return { year: y!, month: m!, day: d!, hour: hh!, minute: mm! };
}

/**
 * A short offset label — "GMT+1" — for stating the zone beside the time.
 *
 * `07 §V.6` wants certainty stated rather than implied, and an offset is the
 * one piece of a zone a reader can check against their own clock.
 */
export function zoneOffsetLabel(instant: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(instant);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}

/** The last path segment of an IANA name — "Africa/Lagos" reads as "Lagos". */
export function zoneCityName(tz: string): string {
  const tail = tz.split('/').pop() ?? tz;
  return tail.replace(/_/g, ' ');
}

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
