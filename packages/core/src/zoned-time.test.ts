import { describe, expect, it } from 'vitest';
import { deviceZone, instantFrom, wallClockIn } from './zoned-time';

describe('wallClockIn', () => {
  it('reads the correct wall-clock time in a positive-offset zone', () => {
    // 2026-06-01T00:00:00Z is 2026-06-01T09:00 in Tokyo (UTC+9, no DST).
    const wall = wallClockIn(new Date('2026-06-01T00:00:00Z'), 'Asia/Tokyo');
    expect(wall).toEqual({ year: 2026, month: 6, day: 1, hour: 9, minute: 0 });
  });

  it('reads the correct wall-clock time in a negative-offset zone', () => {
    // 2026-06-01T00:00:00Z is 2026-05-31T17:00 in Los Angeles (UTC-7, DST).
    const wall = wallClockIn(new Date('2026-06-01T00:00:00Z'), 'America/Los_Angeles');
    expect(wall).toEqual({ year: 2026, month: 5, day: 31, hour: 17, minute: 0 });
  });

  it('rolls over midnight correctly, never producing a 24:00 reading', () => {
    const wall = wallClockIn(new Date('2026-01-01T00:00:00Z'), 'UTC');
    expect(wall.hour).toBe(0);
  });
});

describe('instantFrom', () => {
  it('round-trips through wallClockIn for an ordinary date', () => {
    const wall = { year: 2027, month: 3, day: 15, hour: 9, minute: 30 };
    const instant = instantFrom(wall, 'Europe/London');
    expect(wallClockIn(instant, 'Europe/London')).toEqual(wall);
  });

  it('produces different instants for the same wall clock in different zones', () => {
    const wall = { year: 2026, month: 6, day: 1, hour: 9, minute: 0 };
    const tokyo = instantFrom(wall, 'Asia/Tokyo');
    const losAngeles = instantFrom(wall, 'America/Los_Angeles');
    expect(tokyo.getTime()).not.toBe(losAngeles.getTime());
  });

  it('resolves correctly across a DST boundary (spring forward)', () => {
    // US DST began 2026-03-08 02:00 -> 03:00 in America/New_York.
    const before = instantFrom({ year: 2026, month: 3, day: 7, hour: 9, minute: 0 }, 'America/New_York');
    const after = instantFrom({ year: 2026, month: 3, day: 9, hour: 9, minute: 0 }, 'America/New_York');
    // Only 47 hours of real elapsed time pass across a spring-forward day,
    // not 48 — confirms the offset used is the one at the target instant,
    // not the one at the naive UTC guess.
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(47);
  });
});

describe('deviceZone', () => {
  it('returns a non-empty IANA-shaped string', () => {
    const zone = deviceZone();
    expect(typeof zone).toBe('string');
    expect(zone.length).toBeGreaterThan(0);
  });
});
