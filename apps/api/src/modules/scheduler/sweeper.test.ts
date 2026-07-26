import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { auditEvents, scheduledActions } from '../../db/schema/index.js';
import { VirtualClock } from '../../lib/clock.js';
import { sweep } from './sweeper.js';
import { insertScheduledAction } from './test-helpers.js';

const trackedActionIds: string[] = [];

async function loadAction(id: string) {
  const [row] = await db.select().from(scheduledActions).where(eq(scheduledActions.id, id));
  if (!row) throw new Error(`scheduled_action ${id} not found`);
  return row;
}

describe('sweeper (T-13) — queue-loss recovery', () => {
  afterAll(async () => {
    if (trackedActionIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.subjectId, trackedActionIds));
      await db.delete(scheduledActions).where(inArray(scheduledActions.id, trackedActionIds));
    }
    await pool.end();
  });

  it('re-arms an enqueued row a dead worker never finished, back to pending', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const subjectId = randomUUID();
    const staleLockedAt = new Date(clock.now().getTime() - 15 * 60 * 1000); // 15 min ago > 10 min staleness threshold
    const action = await insertScheduledAction(db, {
      kind: 'capsule_unlock',
      subjectId,
      runAt: new Date(clock.now().getTime() - 20 * 60 * 1000),
      state: 'enqueued',
      lockedBy: 'promoter',
      lockedAt: staleLockedAt,
      attempts: 0,
    });
    trackedActionIds.push(action.id);

    // `rearmed` is a global aggregate across the whole table (other concurrently-running test files' own
    // stale rows count too) — the meaningful assertion is this test's own row's resulting state below.
    const result = await sweep(db, clock);
    expect(result.rearmed).toBeGreaterThanOrEqual(1);

    const row = await loadAction(action.id);
    expect(row.state).toBe('pending');
    expect(row.lockedBy).toBeNull();
    expect(row.attempts).toBe(1);
  });

  it('does not touch a recently-enqueued row still within the staleness window', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const subjectId = randomUUID();
    const action = await insertScheduledAction(db, {
      kind: 'capsule_unlock',
      subjectId,
      runAt: clock.now(),
      state: 'enqueued',
      lockedBy: 'promoter',
      lockedAt: new Date(clock.now().getTime() - 60 * 1000), // 1 min ago
    });
    trackedActionIds.push(action.id);

    await sweep(db, clock);

    const row = await loadAction(action.id);
    expect(row.state).toBe('enqueued');
  });

  it('alarms (once) on a pending row well past its run_at — the promoter itself missed it', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const subjectId = randomUUID();
    const action = await insertScheduledAction(db, {
      kind: 'capsule_unlock',
      subjectId,
      runAt: new Date(clock.now().getTime() - 20 * 60 * 1000),
      state: 'pending',
    });
    trackedActionIds.push(action.id);

    // sweep()'s returned counts are a global aggregate across the whole table — other concurrently-running
    // test files' own overdue rows can also get swept and bump them, so assert on this test's own row via
    // a scoped audit-event query instead of trusting the raw `alarmed` count.
    await sweep(db, clock);
    const alarms = await db.select().from(auditEvents).where(eq(auditEvents.subjectId, action.id));
    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.action).toBe('scheduler.missed_action_alarm');

    // A second sweep in the same window shouldn't spam a duplicate alarm for this row.
    await sweep(db, clock);
    const alarmsAfter = await db.select().from(auditEvents).where(eq(auditEvents.subjectId, action.id));
    expect(alarmsAfter).toHaveLength(1);
  });
});
