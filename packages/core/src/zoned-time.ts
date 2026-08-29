/**
 * Wall-clock arithmetic against a named IANA zone.
 *
 * Ported from `apps/web/src/lib/zoned-time.ts` for E1.4.1 (mobile Address
 * movement) — this is the subset that file's `horizonCandidates()` actually
 * needs (`wallClockIn`, `instantFrom`) plus the device-zone read
 * (`deviceZone`, web's own `browserZone`, renamed since "browser" doesn't
 * describe a React Native host). Not a re-implementation: same algorithm,
 * same reasoning, same `Intl`-only approach (no date library — the platform
 * already carries the full IANA zone database, including DST rules, on
 * both web and Hermes/RN).
 *
 * Deliberately **not** the full file: `reanchor`, `zoneOffsetLabel`,
 * `zoneCityName`, `dateInputValue`/`timeInputValue`/`parseWallClock` (the
 * `<input type="date">` string-format glue) are web's own zone-picker and
 * text-input machinery — E1.4.1's mobile Address movement uses a native
 * date/time picker (`@react-native-community/datetimepicker`) that returns
 * a `Date` directly and, for this ticket, only supports the device's own
 * current zone (absolute mode) — recipient-local delivery time and the
 * curated zone-search picker are deferred, not silently dropped; see the
 * mobile Address screen's own header comment. If a later ticket adds that,
 * port the rest of `zoned-time.ts` here rather than reimplementing it.
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
function zoneOffsetMinutes(instant: Date, tz: string): number {
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

/** The device's own current IANA zone (web's `browserZone`, same `Intl` call, renamed for a non-browser host). */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
