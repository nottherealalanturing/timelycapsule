import { describe, expect, it } from 'vitest';
import { countdownParts } from './countdown';

describe('countdownParts', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('uses years granularity beyond 1 year out', () => {
    const target = new Date('2028-04-01T00:00:00Z');
    const result = countdownParts(target, now);
    expect(result.granularity).toBe('years');
    expect(result.years).toBeGreaterThanOrEqual(2);
  });

  it('uses days granularity between 30 days and 1 year', () => {
    const target = new Date('2026-03-01T00:00:00Z');
    const result = countdownParts(target, now);
    expect(result.granularity).toBe('days');
    expect(result.days).toBeGreaterThan(0);
  });

  it('uses clock granularity under 30 days', () => {
    const target = new Date('2026-01-01T00:00:07Z');
    const result = countdownParts(target, now);
    expect(result.granularity).toBe('clock');
    expect(result.seconds).toBe(7);
  });

  it('clamps to zero for past targets', () => {
    const target = new Date('2020-01-01T00:00:00Z');
    const result = countdownParts(target, now);
    expect(result.granularity).toBe('clock');
    expect(result.days).toBe(0);
    expect(result.hours).toBe(0);
  });
});
