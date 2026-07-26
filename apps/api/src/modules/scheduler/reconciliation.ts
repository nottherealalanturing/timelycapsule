import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { logger } from '../../logger.js';
import { audit } from '../../db/audit.js';
import { capsules, scheduledActions } from '../../db/schema/index.js';

export interface ReconciliationResult {
  checked: number;
  healed: number;
}

/**
 * "No capsule left behind" (03-ARCHITECTURE.md §10): every `sealed` capsule
 * must have a live (`pending` or `enqueued`) `capsule_unlock` row. A gap can
 * only happen from a bug (e.g. a bypassed `sealCapsule` path, a botched
 * migration) since sealing always inserts one — so this is a daily
 * consistency check, not a normal-path mechanism. Discrepancies are healed
 * (a fresh row is inserted at the capsule's `unlockAt`) and always alarmed,
 * since a healthy system should never hit this.
 */
export async function reconcileScheduledUnlocks(db: Database, clock: Clock): Promise<ReconciliationResult> {
  const sealedCapsules = await db.select({ id: capsules.id, unlockAt: capsules.unlockAt }).from(capsules).where(eq(capsules.state, 'sealed'));
  if (sealedCapsules.length === 0) return { checked: 0, healed: 0 };

  const capsuleIds = sealedCapsules.map((c) => c.id);
  const liveRows = await db
    .select({ subjectId: scheduledActions.subjectId })
    .from(scheduledActions)
    .where(and(eq(scheduledActions.kind, 'capsule_unlock'), inArray(scheduledActions.subjectId, capsuleIds), notInArray(scheduledActions.state, ['done', 'cancelled', 'failed'])));
  const covered = new Set(liveRows.map((r) => r.subjectId));

  let healed = 0;
  for (const capsule of sealedCapsules) {
    if (covered.has(capsule.id)) continue;
    if (!capsule.unlockAt) continue; // shouldn't happen for a sealed capsule, but nothing sane to heal without an unlock time.

    await audit(db, {
      actorType: 'system',
      action: 'scheduler.reconciliation_healed',
      subjectType: 'capsule',
      subjectId: capsule.id,
      metadata: { unlockAt: capsule.unlockAt.toISOString() },
    });
    await db
      .insert(scheduledActions)
      .values({
        kind: 'capsule_unlock',
        subjectId: capsule.id,
        runAt: capsule.unlockAt,
        idempotencyKey: `capsule_unlock:${capsule.id}:reconciled:${clock.now().getTime()}`,
      })
      .onConflictDoNothing({ target: scheduledActions.idempotencyKey });
    healed += 1;
  }

  if (healed > 0) {
    logger.error({ event: 'scheduler_reconciliation_healed', healed, checked: sealedCapsules.length }, 'Reconciliation found and healed orphaned sealed capsules');
  }

  return { checked: sealedCapsules.length, healed };
}
