const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const MONTH = YEAR / 12;

/**
 * Pure duration/date formatting for the reveal locked screen — copied
 * verbatim from `apps/web/src/lib/waiting.ts` (`formatAbsoluteDate`,
 * `horizonPhrase`) and `packages/ui-web/src/DualClock.tsx`
 * (`formatDuration`), not re-derived from scratch. Duplicated as plain
 * functions here rather than imported from `@tc/ui-web`, which is a
 * React-DOM component library with no React Native entry point — pulling
 * it in as a dependency just for three pure functions would add a real,
 * unnecessary web-only dependency to this app. `@tc/ui-web` remains the
 * source of truth if either implementation ever needs to change; this file
 * should be updated to match, not diverge on its own judgment.
 */
export function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** See `packages/ui-web/src/DualClock.tsx`'s own comment on why a month is a twelfth of a year, not a flat 30 days. */
export function formatDuration(ms: number): string {
  const t = Math.max(0, ms);
  if (t >= YEAR) return `${Math.floor(t / YEAR)} y ${Math.floor((t % YEAR) / MONTH)} m`;
  if (t >= MONTH) return `${Math.floor(t / MONTH)} m ${Math.floor((t % MONTH) / DAY)} d`;
  if (t >= DAY) return `${Math.floor(t / DAY)} d ${Math.floor((t % DAY) / HOUR)} h`;
  if (t >= HOUR) return `${Math.floor(t / HOUR)} h ${Math.floor((t % HOUR) / MINUTE)} m`;
  const m = Math.floor(t / MINUTE);
  const s = Math.floor((t % MINUTE) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** `07-EXPERIENCE-BIBLE.md` §VIII.2 — flat, no adjectives, no urgency at the near end. */
export function horizonPhrase(remainingMs: number): string {
  if (remainingMs <= 0) return 'Due now.';
  if (remainingMs >= 2 * YEAR) return 'Years out.';
  if (remainingMs >= YEAR) return 'Over a year out.';
  if (remainingMs >= 60 * DAY) return 'Months out.';
  if (remainingMs >= 14 * DAY) return 'Weeks out.';
  if (remainingMs >= 2 * DAY) return 'Days out.';
  if (remainingMs >= 2 * HOUR) return 'Hours out.';
  return 'Within the hour.';
}
