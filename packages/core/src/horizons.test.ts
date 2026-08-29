import { describe, expect, it } from 'vitest';
import { ageAt, calendarMoments, gapPhrase, horizonCandidates, lengths, milestoneHorizons, reasonFor } from './horizons';

const TZ = 'UTC';

describe('calendarMoments', () => {
  it('offers the next New Year at 9am', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const [newYear] = calendarMoments(now, TZ);
    expect(newYear!.label).toBe('The next New Year');
    expect(newYear!.kind).toBe('moment');
    expect(newYear!.at.getUTCFullYear()).toBe(2027);
    expect(newYear!.at.getUTCMonth()).toBe(0);
    expect(newYear!.at.getUTCDate()).toBe(1);
    expect(newYear!.at.getUTCHours()).toBe(9);
  });

  it('offers the decade turn only when it is further out than next New Year', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const moments = calendarMoments(now, TZ);
    expect(moments.some((m) => m.id === 'decade')).toBe(true);
    const decade = moments.find((m) => m.id === 'decade')!;
    expect(decade.at.getUTCFullYear()).toBe(2030);
  });

  it('omits the decade turn when the next New Year already is one', () => {
    const now = new Date('2029-06-15T12:00:00Z');
    const moments = calendarMoments(now, TZ);
    expect(moments.some((m) => m.id === 'decade')).toBe(false);
  });
});

describe('lengths', () => {
  it('produces six length candidates, all marked as lengths', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const all = lengths(now, TZ);
    expect(all).toHaveLength(6);
    expect(all.every((c) => c.kind === 'length')).toBe(true);
  });

  it('a year from now lands roughly 365 days out', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const oneYear = lengths(now, TZ).find((c) => c.id === 'y1')!;
    const days = (oneYear.at.getTime() - now.getTime()) / (24 * 3600_000);
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });
});

describe('ageAt', () => {
  it('computes whole-years age correctly before and after the birthday this year', () => {
    expect(ageAt('2000-06-15', new Date('2026-06-01T00:00:00Z'), TZ)).toBe(25);
    expect(ageAt('2000-06-15', new Date('2026-07-01T00:00:00Z'), TZ)).toBe(26);
  });

  it('returns null for a malformed birthday', () => {
    expect(ageAt('not-a-date', new Date(), TZ)).toBeNull();
  });
});

describe('milestoneHorizons', () => {
  it('returns an empty array when the person has no birthday', () => {
    expect(milestoneHorizons(new Date(), TZ, { name: 'you', birthday: null, self: true })).toEqual([]);
  });

  it("offers the person's next birthday, correctly labeled for self vs. someone else", () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const selfMoments = milestoneHorizons(now, TZ, { name: 'you', birthday: '2000-06-15', self: true });
    expect(selfMoments[0]!.label).toBe('Your next birthday');
    expect(selfMoments[0]!.reason).toContain('You turn');

    const otherMoments = milestoneHorizons(now, TZ, { name: 'Amara', birthday: '2000-06-15', self: false });
    expect(otherMoments[0]!.label).toBe("Amara's next birthday");
    expect(otherMoments[0]!.reason).toContain('Amara');
  });

  it('offers future milestone ages but never one already passed', () => {
    const now = new Date('2026-01-01T00:00:00Z'); // person turns 26 in June 2026
    const moments = milestoneHorizons(now, TZ, { name: 'you', birthday: '2000-06-15', self: true });
    const ageIds = moments.map((m) => m.id);
    expect(ageIds).not.toContain('age-18'); // long past
    expect(ageIds).toContain('age-30');
  });
});

describe('horizonCandidates', () => {
  it('returns an empty array when nothing survives the maxHorizonMs filter', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const candidates = horizonCandidates(now, TZ, null, { maxHorizonMs: 1 });
    expect(candidates).toEqual([]);
  });

  it('never offers a candidate beyond maxHorizonMs', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const oneYearMs = 365 * 24 * 3600_000;
    const candidates = horizonCandidates(now, TZ, null, { maxHorizonMs: oneYearMs });
    for (const c of candidates) {
      expect(c.at.getTime() - now.getTime()).toBeLessThanOrEqual(oneYearMs);
    }
  });

  it('returns candidates in ascending date order', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const candidates = horizonCandidates(now, TZ);
    const times = candidates.map((c) => c.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('prefers a birthday moment over a length candidate landing in the same band', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const person = { name: 'you', birthday: '2016-01-10', self: true }; // 10th birthday in ~9 days
    const candidates = horizonCandidates(now, TZ, person);
    expect(candidates.some((c) => c.id === 'next-birthday')).toBe(true);
  });
});

describe('reasonFor', () => {
  it("returns the matched candidate's own reason when the date matches one exactly", () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const candidates = calendarMoments(now, TZ);
    const reason = reasonFor(candidates[0]!.at, candidates, null, TZ, now);
    expect(reason).toBe(candidates[0]!.reason);
  });

  it("falls back to the person's age when the hand-picked date lands on their birthday", () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const person = { name: 'you', birthday: '2000-06-15', self: true };
    const picked = new Date('2027-06-15T09:00:00Z');
    const reason = reasonFor(picked, [], person, TZ, now);
    expect(reason).toContain('You will be');
  });

  it('falls back to a gap phrase for a plain hand-picked date with no person', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const picked = new Date('2026-01-05T00:00:00Z');
    const reason = reasonFor(picked, [], null, TZ, now);
    expect(reason).toBe(gapPhrase(now.getTime(), picked.getTime()));
  });
});

describe('gapPhrase', () => {
  const now = new Date('2026-01-01T00:00:00Z').getTime();

  it('handles the full range from "now" to years away', () => {
    expect(gapPhrase(now, now)).toBe('Now.');
    expect(gapPhrase(now, now + 3600_000)).toBe('Later today.');
    expect(gapPhrase(now, now + 30 * 3600_000)).toBe('Tomorrow.');
    expect(gapPhrase(now, now + 5 * 24 * 3600_000)).toBe('Five days from now.');
    expect(gapPhrase(now, now + 21 * 24 * 3600_000)).toBe('Three weeks from now.');
    expect(gapPhrase(now, now + 90 * 24 * 3600_000)).toBe('Three months from now.');
    expect(gapPhrase(now, now + 400 * 24 * 3600_000)).toBe('A year from now.');
    expect(gapPhrase(now, now + 10 * 365.25 * 24 * 3600_000)).toBe('Ten years from now.');
  });
});
