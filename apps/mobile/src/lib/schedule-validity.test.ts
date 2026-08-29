import { describe, expect, it } from 'vitest';
import { describeScheduleProblem, MAX_UNLOCK_HORIZON_MS, MIN_UNLOCK_LEAD_MS } from './schedule-validity';

describe('describeScheduleProblem', () => {
  const now = new Date('2026-01-01T00:00:00.000Z').getTime();

  it('returns null when nothing is selected yet', () => {
    expect(describeScheduleProblem(null, now)).toBeNull();
  });

  it('returns null for a comfortably valid moment', () => {
    const selected = new Date(now + 60 * 24 * 3600_000); // 60 days out
    expect(describeScheduleProblem(selected, now)).toBeNull();
  });

  it('flags a moment that has already passed, distinctly from "too soon"', () => {
    const selected = new Date(now - 1000);
    const problem = describeScheduleProblem(selected, now);
    expect(problem?.passed).toBe(true);
    expect(problem?.message).toContain('has passed');
  });

  it('flags a moment under the five-minute minimum lead as "too soon", not "passed"', () => {
    const selected = new Date(now + 60_000); // 1 minute out
    const problem = describeScheduleProblem(selected, now);
    expect(problem?.passed).toBe(true);
    expect(problem?.message).toContain('less than five minutes');
  });

  it('accepts a moment exactly at the five-minute boundary', () => {
    const selected = new Date(now + MIN_UNLOCK_LEAD_MS);
    expect(describeScheduleProblem(selected, now)).toBeNull();
  });

  it('flags a moment beyond the fifty-year maximum horizon', () => {
    const selected = new Date(now + MAX_UNLOCK_HORIZON_MS + 24 * 3600_000);
    const problem = describeScheduleProblem(selected, now);
    expect(problem?.passed).toBe(false);
    expect(problem?.message).toBe('A capsule can travel up to fifty years.');
  });

  it('accepts a moment exactly at the fifty-year boundary', () => {
    const selected = new Date(now + MAX_UNLOCK_HORIZON_MS);
    expect(describeScheduleProblem(selected, now)).toBeNull();
  });
});
