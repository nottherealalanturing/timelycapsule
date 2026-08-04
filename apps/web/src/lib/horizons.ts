import { instantFrom, wallClockIn } from './zoned-time';

/**
 * Moments a capsule might belong to.
 *
 * The composer's job here is not to let someone edit a timestamp — it is to let
 * them decide *when this message belongs*. Those are different tasks and they
 * want different controls: a date field is good at the first and actively bad
 * at the second, because it asks a person holding an intention ("when she's
 * grown", "the next time the year turns") to do the arithmetic themselves
 * before they can express it.
 *
 * So the candidates below are moments with meaning, each of which happens to
 * resolve to an exact instant. The instant is what gets stored and it is stated
 * plainly at all times — `07 §VIII.4` requires the literal date, and a relative
 * phrase may only accompany it. But the *choosing* is done in the language of
 * the decision.
 */

/**
 * Nine in the morning, in whichever zone the capsule's clock hangs.
 *
 * A capsule that opens at 03:14 opens while its reader is asleep, and the
 * moment then belongs to a notification rather than to them. Every generated
 * horizon lands at a civilised hour unless someone deliberately chooses
 * otherwise through the exact controls.
 */
const OPENING_HOUR = 9;

export interface HorizonChoice {
  id: string;
  /** What the writer reads — the moment, not the arithmetic. */
  label: string;
  at: Date;
  /** A second line where the moment carries an implication worth stating. */
  note?: string;
}

function atOpeningHour(tz: string, year: number, month: number, day: number): Date {
  return instantFrom({ year, month, day, hour: OPENING_HOUR, minute: 0 }, tz);
}

/** Horizons that need nothing but a calendar. */
export function standardHorizons(now: Date, tz: string): HorizonChoice[] {
  const here = wallClockIn(now, tz);
  const inMonths = (n: number) => {
    const total = here.month - 1 + n;
    return atOpeningHour(tz, here.year + Math.floor(total / 12), (total % 12) + 1, here.day);
  };
  return [
    { id: 'm1', label: 'A month from now', at: inMonths(1) },
    { id: 'm6', label: 'Six months from now', at: inMonths(6) },
    { id: 'new-year', label: 'When the year turns', at: atOpeningHour(tz, here.year + 1, 1, 1) },
    { id: 'y1', label: 'A year from now', at: atOpeningHour(tz, here.year + 1, here.month, here.day) },
    { id: 'y5', label: 'Five years from now', at: atOpeningHour(tz, here.year + 5, here.month, here.day) },
    { id: 'y10', label: 'Ten years from now', at: atOpeningHour(tz, here.year + 10, here.month, here.day) },
    { id: 'y25', label: 'A quarter century from now', at: atOpeningHour(tz, here.year + 25, here.month, here.day) },
  ];
}

const MILESTONE_AGES = [1, 5, 10, 13, 16, 18, 21, 25, 30, 40, 50, 60, 70];

/** How many whole years old someone born on `birthday` is at `at`. */
export function ageAt(birthday: string, at: Date, tz: string): number | null {
  const [by, bm, bd] = birthday.split('-').map(Number);
  if (!by || !bm || !bd) return null;
  const w = wallClockIn(at, tz);
  let age = w.year - by;
  if (w.month < bm || (w.month === bm && w.day < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * Horizons anchored to a person.
 *
 * `07 §IX` calls the recipient's future age "the single most affecting piece of
 * arithmetic we can perform", and this is where it is performed — not as a
 * decoration under a date the writer already picked, but as the thing they
 * choose *by*. "When Amara turns eighteen" is a decision someone can make;
 * "2044-03-11" is a result.
 */
export function milestoneHorizons(now: Date, tz: string, birthday: string, name: string): HorizonChoice[] {
  const [, bm, bd] = birthday.split('-').map(Number);
  if (!bm || !bd) return [];

  const currentAge = ageAt(birthday, now, tz);
  if (currentAge === null) return [];

  const here = wallClockIn(now, tz);
  const out: HorizonChoice[] = [];

  // The next birthday, whichever side of today it falls. Either way it is the
  // one that takes them from `currentAge` to the next year of their life.
  const thisYears = atOpeningHour(tz, here.year, bm, bd);
  const nextBirthdayYear = thisYears.getTime() > now.getTime() ? here.year : here.year + 1;
  out.push({
    id: 'next-birthday',
    label: `${name}'s next birthday`,
    at: atOpeningHour(tz, nextBirthdayYear, bm, bd),
    note: `Turning ${currentAge + 1}`,
  });

  for (const age of MILESTONE_AGES) {
    if (age <= currentAge + 1) continue; // the next birthday already covers this
    const year = Number(birthday.slice(0, 4)) + age;
    const at = atOpeningHour(tz, year, bm, bd);
    if (at.getTime() <= now.getTime()) continue;
    out.push({ id: `age-${age}`, label: `When ${name} turns ${age}`, at });
  }

  return out;
}

/**
 * The candidates offered on the Horizon, nearest first.
 *
 * Capped, and thinned where two moments land close enough together that both
 * marks would sit on top of each other — the line is meant to show how far
 * apart these moments are, which it cannot do if they overlap.
 */
export function horizonCandidates(
  now: Date,
  tz: string,
  recipient?: { name: string; birthday: string | null } | null,
  options?: { limit?: number; maxHorizonMs?: number },
): HorizonChoice[] {
  const limit = options?.limit ?? 6;
  const maxHorizonMs = options?.maxHorizonMs ?? Infinity;

  const standard = standardHorizons(now, tz);
  const milestones =
    recipient?.birthday && recipient.name ? milestoneHorizons(now, tz, recipient.birthday, recipient.name) : [];

  // Milestones lead: a moment in someone's life is a better reason to choose a
  // date than the fact that a round number of years will have passed.
  const merged = [...milestones, ...standard]
    // Never offer a moment this entry point cannot actually schedule. A guest
    // choosing "ten years from now" and meeting a validation error afterwards
    // is the same broken promise as a disabled row advertising an upgrade.
    .filter((c) => c.at.getTime() - now.getTime() <= maxHorizonMs)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  // Thinned by *visual* separation rather than by a fixed number of days,
  // because the line is logarithmic: two moments a month apart are far apart
  // next year and indistinguishable in 2050. Comparing log-distances is the
  // same measure the Horizon uses to place them, so what gets dropped is
  // exactly what would have overlapped.
  const MIN_LOG_SEPARATION = 0.25;
  const logGap = (at: Date) => Math.log(Math.max(1, at.getTime() - now.getTime()));

  const kept: HorizonChoice[] = [];
  for (const choice of merged) {
    const tooClose = kept.some((k) => Math.abs(logGap(k.at) - logGap(choice.at)) < MIN_LOG_SEPARATION);
    if (!tooClose) kept.push(choice);
    if (kept.length >= limit) break;
  }
  return kept;
}

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];

/** Sentence-initial, since every use of this begins one. */
function count(n: number): string {
  const word = n <= 20 ? WORDS[n]! : String(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const DAY_MS = 24 * 3600_000;

/**
 * The distance being chosen, in words.
 *
 * Distinct from `waiting.ts`'s `horizonPhrase`, which reads a capsule already
 * sealed and stays deliberately flat ("Years out."). Here the writer is
 * choosing, and the useful reading is how far they are reaching — but with the
 * same restraint: `03 §V.6` warns this is one adjective away from cloying, so
 * it states a distance and stops.
 */
export function gapPhrase(fromMs: number, toMs: number): string {
  const ms = toMs - fromMs;
  if (ms <= 0) return 'Now.';
  const days = ms / DAY_MS;
  if (days < 1) return 'Later today.';
  if (days < 2) return 'Tomorrow.';
  if (days < 14) return `${count(Math.round(days))} days from now.`;
  if (days < 60) return `${count(Math.round(days / 7))} weeks from now.`;
  if (days < 365) return `${count(Math.round(days / 30.44))} months from now.`;
  const years = days / 365.25;
  if (years < 1.75) return 'A year from now.';
  return `${count(Math.round(years))} years from now.`;
}
