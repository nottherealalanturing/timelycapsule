import type { CapsuleListItem } from '@tc/contracts';

/**
 * Resolves a capsule's unlock instant regardless of unlockMode — recipient_local
 * capsules don't have a single instant until a recipient's tz is known, so this
 * falls back to interpreting unlockLocal in the *browser's* tz as a best-effort
 * owner-side estimate.
 *
 * Lives here rather than beside a component: it is schedule logic, and it was
 * imported from `CapsuleCard` by three unrelated surfaces, which made deleting
 * that component harder than it should have been.
 */
export function resolveUnlockDate(
  capsule: Pick<CapsuleListItem, 'unlockMode' | 'unlockAt' | 'unlockLocal'>,
): Date | null {
  if (capsule.unlockMode === 'recipient_local') {
    if (!capsule.unlockLocal) return null;
    return new Date(`${capsule.unlockLocal.date}T${capsule.unlockLocal.time}:00`);
  }
  return capsule.unlockAt ? new Date(capsule.unlockAt) : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

/**
 * `07 §VIII.4` — "Dates are always literal and absolute. Relative time may
 * accompany a date; it may never replace one." Every waiting surface states
 * the day itself, in full, and lets the clock be the relative reading.
 */
export function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatAbsoluteDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatAbsoluteDate(iso)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * The horizon, named in human terms.
 *
 * `03 §V.6` asks for the gap to be made vivid rather than merely dated, and
 * `03 §V.5` requires something to be *visibly different* on returning after six
 * months — this is the "language describing the horizon" it lists alongside
 * position and temperature.
 *
 * Held deliberately flat. `03 §V.6` warns this is "one adjective away from
 * being cloying", and `07 §VIII.2` forbids apologising for the wait, so these
 * state a distance and stop. No adjectives, no reassurance, no urgency at the
 * near end — "Within the hour." is the same voice as "Years out."
 */
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
