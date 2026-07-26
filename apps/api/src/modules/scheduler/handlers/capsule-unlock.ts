import { and, eq, ne } from 'drizzle-orm';
import { audit } from '../../../db/audit.js';
import { capsuleRecipients, capsules, scheduledActions } from '../../../db/schema/index.js';
import type { ActionHandler } from './dispatch.js';

/**
 * sealed → unlocked, then spawns one `recipient_unlock` action per
 * non-suppressed recipient (03-ARCHITECTURE.md §10). Idempotent: re-running
 * against an already-unlocked capsule (e.g. a redelivered pg-boss job) is a
 * no-op, and each spawned row's idempotencyKey collapses duplicate spawns.
 */
export const capsuleUnlockHandler: ActionHandler = async ({ db, clock, subjectId: capsuleId }) => {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) return; // capsule was hard-deleted (e.g. purged) — nothing to unlock.
  if (capsule.state !== 'sealed') return; // already unlocked/withdrawn/expired — idempotent no-op.

  const now = clock.now();
  await db.update(capsules).set({ state: 'unlocked', updatedAt: now }).where(eq(capsules.id, capsuleId));
  await audit(db, { actorType: 'system', action: 'capsule.unlocked', subjectType: 'capsule', subjectId: capsuleId });

  const recipients = await db
    .select({ id: capsuleRecipients.id })
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.capsuleId, capsuleId), ne(capsuleRecipients.status, 'blocked_suppressed')));

  for (const recipient of recipients) {
    await db
      .insert(scheduledActions)
      .values({
        kind: 'recipient_unlock',
        subjectId: recipient.id,
        runAt: now,
        idempotencyKey: `recipient_unlock:${recipient.id}`,
      })
      .onConflictDoNothing({ target: scheduledActions.idempotencyKey });
  }
};
