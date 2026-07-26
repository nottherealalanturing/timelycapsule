/**
 * Every scheduler-adjacent module takes a Clock instead of calling
 * `new Date()` directly, so the T-13 simulation suite can drive decades of
 * wall-clock time (DST transitions, leap years, 50-year horizons) without
 * real timers or mocking global Date.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Deterministic, manually-advanced clock for tests. */
export class VirtualClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = start;
  }

  now(): Date {
    return this.current;
  }

  set(date: Date): void {
    this.current = date;
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
