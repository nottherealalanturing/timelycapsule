import { eq } from 'drizzle-orm';
import type { Database } from '../../../db/client.js';
import type { Clock } from '../../../lib/clock.js';
import { logger } from '../../../logger.js';
import { scheduledActions } from '../../../db/schema/index.js';

/** After this many failed attempts, stop retrying and leave the row terminally `failed` — surfaces in the sweeper's alarm-adjacent audit trail rather than looping forever. */
const MAX_ATTEMPTS = 5;

export interface ActionHandlerArgs {
  db: Database;
  clock: Clock;
  subjectId: string;
}

export type ActionHandler = (args: ActionHandlerArgs) => Promise<void>;

/**
 * Wraps a handler with the scheduled_actions bookkeeping every handler
 * needs: mark `done` on success, or `pending` (for the promoter to retry)
 * / terminally `failed` past MAX_ATTEMPTS on error. `scheduled_actions`
 * stays the single source of truth for outcome — pg-boss's own job state
 * is just the execution vehicle (plan/00-INDEX.md hard rule).
 */
export async function runAction(
  db: Database,
  clock: Clock,
  action: { actionId: string; subjectId: string },
  handler: ActionHandler,
): Promise<void> {
  try {
    await handler({ db, clock, subjectId: action.subjectId });
    await db.update(scheduledActions).set({ state: 'done' }).where(eq(scheduledActions.id, action.actionId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [row] = await db
      .select({ attempts: scheduledActions.attempts })
      .from(scheduledActions)
      .where(eq(scheduledActions.id, action.actionId))
      .limit(1);
    const attempts = (row?.attempts ?? 0) + 1;

    await db
      .update(scheduledActions)
      .set({
        state: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        lastError: message,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(scheduledActions.id, action.actionId));

    logger.error({ event: 'scheduler_action_failed', actionId: action.actionId, attempts, err }, 'Scheduled action handler failed');
    throw err;
  }
}
