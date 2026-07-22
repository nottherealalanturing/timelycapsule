/**
 * Adaptive countdown formatting per plan/02-UX-DESIGN.md §6 (CountdownDisplay):
 * long horizons show coarse units, short horizons get precise, live-updating ones.
 */

export type CountdownGranularity = 'years' | 'days' | 'clock';

export interface CountdownParts {
  granularity: CountdownGranularity;
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function countdownParts(target: Date, now: Date = new Date()): CountdownParts {
  const diffMs = Math.max(0, target.getTime() - now.getTime());

  if (diffMs >= 365 * DAY_MS) {
    const years = Math.floor(diffMs / (365 * DAY_MS));
    const months = Math.floor((diffMs % (365 * DAY_MS)) / (30 * DAY_MS));
    return { granularity: 'years', years, months };
  }

  if (diffMs >= 30 * DAY_MS) {
    const days = Math.floor(diffMs / DAY_MS);
    return { granularity: 'days', days };
  }

  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diffMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((diffMs % MINUTE_MS) / 1000);
  return { granularity: 'clock', days, hours, minutes, seconds };
}
