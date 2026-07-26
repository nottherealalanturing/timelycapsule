import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { scheduledActions, users } from '../../db/schema/index.js';
import { VirtualClock } from '../../lib/clock.js';
import { reresolveWallClockActions } from './resolver.js';
import { createTestCapsule, createTestUser, insertScheduledAction } from './test-helpers.js';

const trackedUserIds: string[] = [];
const trackedActionIds: string[] = [];

async function loadAction(id: string) {
  const [row] = await db.select().from(scheduledActions).where(eq(scheduledActions.id, id));
  if (!row) throw new Error(`scheduled_action ${id} not found`);
  return row;
}

async function setup(unlockLocal: { date: string; time: string; tz: string }, storedRunAt: Date) {
  const user = await createTestUser(db);
  trackedUserIds.push(user.id);
  const capsule = await createTestCapsule(db, user.id, { unlockAt: storedRunAt, unlockLocal });
  const action = await insertScheduledAction(db, { kind: 'capsule_unlock', subjectId: capsule.id, runAt: storedRunAt });
  trackedActionIds.push(action.id);
  return { capsule, action };
}

describe('resolver (T-13) — nightly wall-clock re-resolution', () => {
  afterAll(async () => {
    if (trackedActionIds.length) await db.delete(scheduledActions).where(inArray(scheduledActions.id, trackedActionIds));
    if (trackedUserIds.length) await db.delete(users).where(inArray(users.id, trackedUserIds));
    await pool.end();
  });

  it('spring-forward: a nonexistent local time (2:30am on the gap day) resolves forward by the gap width', async () => {
    // 2024-03-10 America/New_York: clocks jump 02:00 -> 03:00, so 02:30 doesn't exist.
    // A stale stored runAt (e.g. computed under old tz rules) should be corrected.
    const staleRunAt = new Date('2024-03-10T06:00:00Z'); // deliberately wrong
    const { action } = await setup({ date: '2024-03-10', time: '02:30', tz: 'America/New_York' }, staleRunAt);

    const clock = new VirtualClock(new Date('2024-01-01T00:00:00Z')); // well within the 60-day horizon of the action...
    // Horizon is measured from "now" — set now close enough that the March 10 action is within 60 days.
    clock.set(new Date('2024-01-15T00:00:00Z'));

    const updated = await reresolveWallClockActions(db, clock);
    expect(updated).toBe(1);

    const row = await loadAction(action.id);
    // 03:30 EDT (-04:00) == 07:30 UTC
    expect(row.runAt.toISOString()).toBe('2024-03-10T07:30:00.000Z');
  });

  it('fall-back: an ambiguous local time (1:30am, occurs twice) resolves to the first (pre-fallback) occurrence', async () => {
    // 2024-11-03 America/New_York: clocks fall back 02:00 -> 01:00, so 01:30 occurs twice.
    const staleRunAt = new Date('2024-11-03T00:00:00Z');
    const { action } = await setup({ date: '2024-11-03', time: '01:30', tz: 'America/New_York' }, staleRunAt);

    const clock = new VirtualClock(new Date('2024-09-15T00:00:00Z'));
    const updated = await reresolveWallClockActions(db, clock);
    expect(updated).toBe(1);

    const row = await loadAction(action.id);
    // First occurrence is still EDT (-04:00): 01:30 - (-04:00) == 05:30 UTC
    expect(row.runAt.toISOString()).toBe('2024-11-03T05:30:00.000Z');
  });

  it('leap year: Feb 29 resolves correctly on a leap year', async () => {
    const staleRunAt = new Date('2028-02-28T00:00:00Z');
    const { action } = await setup({ date: '2028-02-29', time: '12:00', tz: 'UTC' }, staleRunAt);

    const clock = new VirtualClock(new Date('2028-01-15T00:00:00Z'));
    const updated = await reresolveWallClockActions(db, clock);
    expect(updated).toBe(1);

    const row = await loadAction(action.id);
    expect(row.runAt.toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });

  it('50-year horizon: does not touch an action far outside the 60-day re-resolution window', async () => {
    const storedRunAt = new Date('2076-06-15T12:00:00Z'); // ~50 years out, matches the local fields exactly already
    const { action } = await setup({ date: '2076-06-15', time: '12:00', tz: 'UTC' }, storedRunAt);

    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z')); // 50 years before due — well outside the 60-day horizon
    const updated = await reresolveWallClockActions(db, clock);
    expect(updated).toBe(0);

    const row = await loadAction(action.id);
    expect(row.runAt.toISOString()).toBe(storedRunAt.toISOString());
  });

  it('is a no-op once the stored runAt already matches the current tz-resolved value', async () => {
    const correctRunAt = new Date('2026-06-15T16:00:00.000Z'); // 12:00 EDT (-04:00)
    const { action } = await setup({ date: '2026-06-15', time: '12:00', tz: 'America/New_York' }, correctRunAt);

    const clock = new VirtualClock(new Date('2026-05-01T00:00:00Z'));
    const updated = await reresolveWallClockActions(db, clock);
    expect(updated).toBe(0);

    const row = await loadAction(action.id);
    expect(row.runAt.toISOString()).toBe(correctRunAt.toISOString());
  });

  it('leaves capsules with no unlockLocal (absolute mode) untouched', async () => {
    const runAt = new Date('2026-06-15T12:00:00Z');
    const user = await createTestUser(db);
    trackedUserIds.push(user.id);
    const capsule = await createTestCapsule(db, user.id, { unlockAt: runAt, unlockLocal: null });
    const action = await insertScheduledAction(db, { kind: 'capsule_unlock', subjectId: capsule.id, runAt });
    trackedActionIds.push(action.id);

    const clock = new VirtualClock(new Date('2026-05-01T00:00:00Z'));
    const updated = await reresolveWallClockActions(db, clock);
    expect(updated).toBe(0);
  });
});
