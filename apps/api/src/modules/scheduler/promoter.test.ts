import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { scheduledActions } from '../../db/schema/index.js';
import { VirtualClock } from '../../lib/clock.js';
import { promoteDueActions } from './promoter.js';
import { asQueue, FakeQueue, insertScheduledAction } from './test-helpers.js';

const trackedActionIds: string[] = [];

async function track<T extends { id: string }>(row: T): Promise<T> {
  trackedActionIds.push(row.id);
  return row;
}

async function loadAction(id: string) {
  const [row] = await db.select().from(scheduledActions).where(eq(scheduledActions.id, id));
  if (!row) throw new Error(`scheduled_action ${id} not found`);
  return row;
}

describe('promoter (T-13)', () => {
  afterAll(async () => {
    if (trackedActionIds.length) {
      await db.delete(scheduledActions).where(inArray(scheduledActions.id, trackedActionIds));
    }
    await pool.end();
  });

  it('promotes a pending row due right now and flips it to enqueued', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const queue = new FakeQueue();
    const subjectId = randomUUID();
    const action = await track(await insertScheduledAction(db, { kind: 'trash_purge', subjectId, runAt: clock.now() }));

    // Runs against the same live test DB as every other test file (vitest parallelizes files), so other
    // suites' own pending rows may also be due right now — assert on this test's own row, not the raw
    // global count, which would be flaky under concurrency.
    await promoteDueActions(db, asQueue(queue), clock);
    expect(queue.sent).toContainEqual({ queue: 'trash_purge', job: { actionId: action.id, subjectId }, runAt: action.runAt });

    const row = await loadAction(action.id);
    expect(row.state).toBe('enqueued');
    expect(row.lockedBy).toBe('promoter');
  });

  it('promotes a row within the 5-minute lookahead but not one further out', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const queue = new FakeQueue();
    const nearId = randomUUID();
    const farId = randomUUID();
    const near = await track(
      await insertScheduledAction(db, { kind: 'reminder', subjectId: nearId, runAt: new Date(clock.now().getTime() + 4 * 60 * 1000) }),
    );
    const far = await track(
      await insertScheduledAction(db, { kind: 'reminder', subjectId: farId, runAt: new Date(clock.now().getTime() + 10 * 60 * 1000) }),
    );

    await promoteDueActions(db, asQueue(queue), clock);

    const nearRow = await loadAction(near.id);
    const farRow = await loadAction(far.id);
    expect(nearRow.state).toBe('enqueued');
    expect(farRow.state).toBe('pending');
  });

  it('leaves rows of a kind with no queue (not yet built) pending instead of crashing', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const queue = new FakeQueue();
    const subjectId = randomUUID();
    const action = await track(await insertScheduledAction(db, { kind: 'capsule_expire', subjectId, runAt: clock.now() }));

    await promoteDueActions(db, asQueue(queue), clock);

    const row = await loadAction(action.id);
    expect(row.state).toBe('pending');
    expect(queue.sent.some((s) => s.job.subjectId === subjectId)).toBe(false);
  });

  it('handles a 10k-action burst: all promoted, in run_at order, none dropped or duplicated', async () => {
    const clock = new VirtualClock(new Date('2026-01-01T00:00:00Z'));
    const queue = new FakeQueue();
    const BURST_SIZE = 10_000;

    const subjectIds: string[] = Array.from({ length: BURST_SIZE }, () => randomUUID());
    // Insert in reverse run_at order to make sure ordering is asserted, not assumed from insertion order.
    const values = subjectIds.map((subjectId, i) => ({
      kind: 'reminder' as const,
      subjectId,
      runAt: new Date(clock.now().getTime() - (BURST_SIZE - i) * 1000),
    }));

    const insertedIds: string[] = [];
    for (let i = 0; i < values.length; i += 1000) {
      const chunk = await db.insert(scheduledActions).values(values.slice(i, i + 1000)).returning({ id: scheduledActions.id });
      insertedIds.push(...chunk.map((r) => r.id));
    }
    trackedActionIds.push(...insertedIds);

    // Promoter runs a global scan (other concurrently-running test files' own pending rows are fair game
    // too), so loop until it's plausible everything settled rather than trusting a single pass's count.
    for (let guard = 0; guard < 60; guard += 1) {
      const promoted = await promoteDueActions(db, asQueue(queue), clock);
      if (promoted === 0) break;
    }

    // Scope every assertion to this test's own subjectIds — a shared live DB across parallel test files
    // means the promoter also legitimately picks up unrelated rows from other suites.
    const subjectIdSet = new Set(subjectIds);
    const ourSent = queue.sent.filter((s) => subjectIdSet.has(s.job.subjectId));
    expect(ourSent).toHaveLength(BURST_SIZE);
    expect(new Set(ourSent.map((s) => s.job.actionId)).size).toBe(BURST_SIZE); // none duplicated

    const runAts = ourSent.map((s) => values.find((v) => v.subjectId === s.job.subjectId)!.runAt.getTime());
    expect(runAts).toEqual([...runAts].sort((a, b) => a - b)); // none dropped out of run_at order

    const rows = await db.select({ state: scheduledActions.state }).from(scheduledActions).where(inArray(scheduledActions.id, insertedIds));
    expect(rows.every((r) => r.state === 'enqueued')).toBe(true);
  }, 30_000);
});
