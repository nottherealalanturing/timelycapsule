import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { logger } from '../../logger.js';
import { audit } from '../../db/audit.js';
import { auditEvents, scheduledActions } from '../../db/schema/index.js';

/** A promoter/worker crash between "enqueued" and "done" leaves a row stranded — re-arm after this long. */
const ENQUEUED_STALE_MS = 10 * 60 * 1000;
/** A `pending` row this far past its run_at means the promoter itself missed a tick — alarm, don't just silently catch up. */
const MISSED_ALARM_MS = 10 * 60 * 1000;
/** Don't re-alarm the same stuck row every 30s tick — one alarm per window is enough to page someone. */
const ALARM_REPEAT_WINDOW_MS = 60 * 60 * 1000;

export interface SweepResult {
  rearmed: number;
  alarmed: number;
}

/**
 * The sweeper (plan/03-ARCHITECTURE.md §10): re-arms rows a dead
 * worker/promoter left stuck in `enqueued`, and raises an alarm (audit
 * event, not a state change) for `pending` rows whose run_at slipped well
 * past due — evidence the promoter itself stalled, which should page
 * someone rather than be silently swallowed.
 */
export async function sweep(db: Database, clock: Clock): Promise<SweepResult> {
  const now = clock.now();

  const rearmed = await db
    .update(scheduledActions)
    .set({
      state: 'pending',
      lockedBy: null,
      lockedAt: null,
      attempts: sql`${scheduledActions.attempts} + 1`,
      lastError: 'sweeper: re-armed after enqueued staleness timeout',
    })
    .where(and(eq(scheduledActions.state, 'enqueued'), lt(scheduledActions.lockedAt, new Date(now.getTime() - ENQUEUED_STALE_MS))))
    .returning({ id: scheduledActions.id });

  const missed = await db
    .select({ id: scheduledActions.id, kind: scheduledActions.kind, subjectId: scheduledActions.subjectId, runAt: scheduledActions.runAt })
    .from(scheduledActions)
    .where(and(eq(scheduledActions.state, 'pending'), lt(scheduledActions.runAt, new Date(now.getTime() - MISSED_ALARM_MS))));

  let alarmed = 0;
  for (const row of missed) {
    const [recentAlarm] = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.subjectType, 'scheduled_action'),
          eq(auditEvents.subjectId, row.id),
          eq(auditEvents.action, 'scheduler.missed_action_alarm'),
          gt(auditEvents.createdAt, new Date(now.getTime() - ALARM_REPEAT_WINDOW_MS)),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    if (recentAlarm) continue;

    await audit(db, {
      actorType: 'system',
      action: 'scheduler.missed_action_alarm',
      subjectType: 'scheduled_action',
      subjectId: row.id,
      metadata: { kind: row.kind, subjectId: row.subjectId, runAt: row.runAt.toISOString() },
    });
    alarmed += 1;
  }

  if (rearmed.length > 0 || alarmed > 0) {
    logger.warn({ event: 'scheduler_sweep', rearmed: rearmed.length, alarmed }, 'Sweeper ran');
  }

  return { rearmed: rearmed.length, alarmed };
}
