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
 * Two kinds of candidate, and the distinction decides what a writer meets
 * first:
 *
 *   - A **moment** is a thing that happens — a birthday, the turn of a year or
 *     a decade. It is memorable, it belongs to someone, and it is a reason.
 *   - A **length** is a measurement. "Ten years from now" is useful and
 *     sometimes exactly right, but it is an interval, not an occasion.
 *
 * Moments win every collision and are offered first. Lengths fill the gaps
 * where nothing meaningful lands, and the exact controls sit beneath both for
 * everything neither can express.
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
  /** A moment is an occasion; a length is a measurement. Moments lead. */
  kind: 'moment' | 'length';
  /** A second line where the moment carries an implication worth stating. */
  note?: string;
  /**
   * Why the capsule opens then, for the reading once it is chosen. Absent on
   * lengths, which have no reason beyond their own duration.
   */
  reason?: string;
}

/** Someone the horizon can be anchored to — a recipient, or the writer. */
export interface HorizonPerson {
  /** First name, or "you". */
  name: string;
  birthday: string | null;
  /** Changes the grammar: "you turn 40" rather than "Amara turns 40". */
  self: boolean;
}

function atOpeningHour(tz: string, year: number, month: number, day: number): Date {
  return instantFrom({ year, month, day, hour: OPENING_HOUR, minute: 0 }, tz);
}

/**
 * Occasions available from a calendar alone.
 *
 * Thin by necessity — without knowing anything about the people involved,
 * there are only so many things that genuinely *happen*. A year turning and a
 * decade turning are both real events with a date, and both are more memorable
 * than the interval that happens to reach them.
 */
export function calendarMoments(now: Date, tz: string): HorizonChoice[] {
  const here = wallClockIn(now, tz);
  const nextYear = here.year + 1;
  const out: HorizonChoice[] = [
    {
      id: 'new-year',
      label: 'The next New Year',
      at: atOpeningHour(tz, nextYear, 1, 1),
      kind: 'moment',
      reason: `The first morning of ${nextYear}.`,
    },
  ];

  const decade = (Math.floor(here.year / 10) + 1) * 10;
  if (decade > nextYear) {
    out.push({
      id: 'decade',
      label: 'When the decade turns',
      at: atOpeningHour(tz, decade, 1, 1),
      kind: 'moment',
      reason: `The first morning of the ${decade}s.`,
    });
  }

  return out;
}

/** Lengths of time, for the gaps no occasion falls into. */
export function lengths(now: Date, tz: string): HorizonChoice[] {
  const here = wallClockIn(now, tz);
  const inMonths = (n: number) => {
    const total = here.month - 1 + n;
    return atOpeningHour(tz, here.year + Math.floor(total / 12), (total % 12) + 1, here.day);
  };
  const inYears = (n: number) => atOpeningHour(tz, here.year + n, here.month, here.day);

  return [
    { id: 'm1', label: 'A month from now', at: inMonths(1), kind: 'length' },
    { id: 'm6', label: 'Six months from now', at: inMonths(6), kind: 'length' },
    { id: 'y1', label: 'A year from now', at: inYears(1), kind: 'length' },
    { id: 'y5', label: 'Five years from now', at: inYears(5), kind: 'length' },
    { id: 'y10', label: 'Ten years from now', at: inYears(10), kind: 'length' },
    { id: 'y25', label: 'A quarter century from now', at: inYears(25), kind: 'length' },
  ];
}

const MILESTONE_AGES = [1, 5, 10, 13, 16, 18, 21, 30, 40, 50, 60, 65, 70];

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
 * Moments in a person's life.
 *
 * `07 §IX` calls the recipient's future age "the single most affecting piece of
 * arithmetic we can perform", and this is where it is performed — not as a
 * decoration under a date the writer already picked, but as the thing they
 * choose *by*. "When Amara turns eighteen" is a decision someone can make;
 * "2044-03-11" is a result.
 */
export function milestoneHorizons(now: Date, tz: string, person: HorizonPerson): HorizonChoice[] {
  if (!person.birthday) return [];
  const [, bm, bd] = person.birthday.split('-').map(Number);
  if (!bm || !bd) return [];

  const currentAge = ageAt(person.birthday, now, tz);
  if (currentAge === null) return [];

  const here = wallClockIn(now, tz);
  const out: HorizonChoice[] = [];
  const { name, self } = person;
  const turns = (n: number) => (self ? `you turn ${n}` : `${name} turns ${n}`);
  const willBe = (n: number) => (self ? `You will be ${n}.` : `${name} will be ${n}.`);

  // The next birthday, whichever side of today it falls. Either way it is the
  // one that takes them from `currentAge` to the next year of their life.
  const thisYears = atOpeningHour(tz, here.year, bm, bd);
  const nextBirthdayYear = thisYears.getTime() > now.getTime() ? here.year : here.year + 1;
  out.push({
    id: 'next-birthday',
    label: self ? 'Your next birthday' : `${name}'s next birthday`,
    at: atOpeningHour(tz, nextBirthdayYear, bm, bd),
    kind: 'moment',
    note: `Turning ${currentAge + 1}`,
    reason: self ? `Your birthday. You turn ${currentAge + 1}.` : `${name}'s birthday. Turning ${currentAge + 1}.`,
  });

  for (const age of MILESTONE_AGES) {
    if (age <= currentAge + 1) continue; // the next birthday already covers this
    const year = Number(person.birthday.slice(0, 4)) + age;
    const at = atOpeningHour(tz, year, bm, bd);
    if (at.getTime() <= now.getTime()) continue;
    out.push({ id: `age-${age}`, label: `When ${turns(age)}`, at, kind: 'moment', reason: willBe(age) });
  }

  return out;
}

/**
 * The candidates offered on the Horizon.
 *
 * Priority order decides what survives thinning — every moment before any
 * length — but the kept set is returned in date order, so the list reads the
 * same direction the line does.
 */
export function horizonCandidates(
  now: Date,
  tz: string,
  person?: HorizonPerson | null,
  options?: { limit?: number; maxHorizonMs?: number },
): HorizonChoice[] {
  const limit = options?.limit ?? 6;
  const maxHorizonMs = options?.maxHorizonMs ?? Infinity;

  const byPriority = [
    ...(person ? milestoneHorizons(now, tz, person) : []),
    ...calendarMoments(now, tz),
    ...lengths(now, tz),
  ]
    // Never offer a moment this entry point cannot actually schedule. A guest
    // choosing "ten years from now" and meeting a validation error afterwards
    // is the same broken promise as a disabled row advertising an upgrade.
    .filter((c) => {
      const delta = c.at.getTime() - now.getTime();
      return delta > 0 && delta <= maxHorizonMs;
    });

  if (byPriority.length === 0) return [];

  /**
   * One choice per band of the line, moments winning their band.
   *
   * Straight priority order put six of someone's birthdays on the list and
   * pushed every other option off it, so the nearest thing a writer could pick
   * was seven months away. Straight chronological thinning did the opposite and
   * let a round number of years displace a birthday. Banding the line and
   * asking each band for its best candidate gets both: occasions win wherever
   * they exist, and the set still spans from weeks to decades.
   *
   * Bands are logarithmic because the line is — equal bands in time would put
   * every one of them in the first year.
   */
  const logGap = (at: Date) => Math.log(Math.max(1, at.getTime() - now.getTime()));
  const gaps = byPriority.map((c) => logGap(c.at));
  const lo = Math.min(...gaps);
  const hi = Math.max(...gaps);
  const span = hi - lo || 1;

  const bands = new Map<number, HorizonChoice>();
  for (const choice of byPriority) {
    const band = Math.min(limit - 1, Math.floor(((logGap(choice.at) - lo) / span) * limit));
    const held = bands.get(band);
    if (!held) {
      bands.set(band, choice);
      continue;
    }
    // A moment displaces a length; between two of a kind, the earlier wins,
    // since it is the one a writer is more likely to be reaching for.
    if (held.kind === 'length' && choice.kind === 'moment') bands.set(band, choice);
  }

  return [...bands.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Why this capsule opens when it does.
 *
 * Prefers the occasion over the measurement: having chosen "when Amara turns
 * ten", the reading should say what that day *is*, not restate that it is ten
 * years away — the writer already knows, and the date is stated in full
 * directly above. Falls back to the distance only when there is no occasion to
 * name, which is the case for a length or a hand-picked date.
 */
export function reasonFor(
  at: Date,
  candidates: HorizonChoice[],
  person: HorizonPerson | null,
  tz: string,
  now: Date,
): string {
  const match = candidates.find((c) => Math.abs(c.at.getTime() - at.getTime()) < 60_000);
  if (match?.reason) return match.reason;

  // Even a hand-picked date has an occasion if it lands on someone's life.
  if (person?.birthday) {
    const age = ageAt(person.birthday, at, tz);
    if (age !== null) {
      return person.self ? `You will be ${age}.` : `${person.name} will be ${age}.`;
    }
  }

  return gapPhrase(now.getTime(), at.getTime());
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
