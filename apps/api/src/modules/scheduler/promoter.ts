import type { PgBoss } from 'pg-boss';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { logger } from '../../logger.js';
import { scheduledActions } from '../../db/schema/index.js';
import { QUEUE_NAMES, sendAction, type QueueName } from './queue.js';

const LOOKAHEAD_MS = 5 * 60 * 1000;
/*
 * T-22 load test: at 500/tick × a 30s tick, combined throughput caps at
 * ~1,000 actions/min regardless of backlog size — measured live against a
 * real 20,000-action backlog (10k `capsule_unlock` + the `recipient_unlock`
 * rows they spawn), it did not drain within the 10-minute DoD (9,300 still
 * pending at t+597s). `recipient_unlock` rows don't exist until their parent
 * `capsule_unlock` has already run, so a burst like this is two sequential
 * ~10k waves through the same ceiling, not one — worse than the batch size
 * alone suggests.
 *
 * Raised 4x rather than shortening the tick (plan/03-ARCHITECTURE.md fixes
 * the interval at "every 30s in production"; a bigger claim per tick reaches
 * the same throughput without touching that cadence). Safe at this size:
 * `promoter.test.ts` already proves 10,000 rows claim, in order, with none
 * dropped or duplicated, inside one transaction in ~5.8s — comfortably
 * inside a single 30s tick.
 */
const BATCH_SIZE = 2000;

function isQueueName(kind: string): kind is QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(kind);
}

/**
 * The promoter: ticks on an interval (plan/03-ARCHITECTURE.md §10 — every
 * 30s in production), claims every `pending` row due within the lookahead
 * window with `FOR UPDATE SKIP LOCKED` (safe with more than one scheduler
 * instance running, even though plan/04-ZERO-COST-PLAN.md says a single
 * instance needs no leader election), flips it to `enqueued`, and hands it
 * to pg-boss. Returns the number of rows promoted, for tests/logging.
 */
export async function promoteDueActions(db: Database, queue: PgBoss, clock: Clock): Promise<number> {
  const cutoff = new Date(clock.now().getTime() + LOOKAHEAD_MS);

  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: scheduledActions.id, kind: scheduledActions.kind, subjectId: scheduledActions.subjectId, runAt: scheduledActions.runAt })
      .from(scheduledActions)
      .where(and(eq(scheduledActions.state, 'pending'), lte(scheduledActions.runAt, cutoff)))
      .orderBy(asc(scheduledActions.runAt))
      .limit(BATCH_SIZE)
      .for('update', { skipLocked: true });

    for (const row of due) {
      if (!isQueueName(row.kind)) {
        // capsule_expire / expire_purge / checkin / trigger_release / chain_unlock /
        // series_spawn belong to tickets not yet built — leave them pending rather
        // than silently dropping or crashing the promoter on an unknown kind.
        continue;
      }
      await sendAction(queue, row.kind, { actionId: row.id, subjectId: row.subjectId }, row.runAt);
      await tx
        .update(scheduledActions)
        .set({ state: 'enqueued', lockedBy: 'promoter', lockedAt: clock.now() })
        .where(eq(scheduledActions.id, row.id));
    }

    if (due.length > 0) {
      logger.info({ event: 'scheduler_promoted', count: due.length }, 'Promoted due scheduled_actions');
    }
    return due.length;
  });
}
