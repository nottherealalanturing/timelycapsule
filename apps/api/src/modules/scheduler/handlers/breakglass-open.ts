import { eq } from 'drizzle-orm';
import { audit } from '../../../db/audit.js';
import { capsules } from '../../../db/schema/index.js';
import type { ActionHandler } from './dispatch.js';

/**
 * Forces an early unlock for a legacy/emergency capsule with break-glass
 * enabled. No endpoint exists yet to *request* a break-glass open (that's
 * the legacy/trustee feature, not yet built — see plan/PROGRESS.md T-12
 * decisions log) — this handler only needs to exist and behave correctly
 * once something eventually schedules the action, per the ticket's
 * required handler list.
 */
export const breakglassOpenHandler: ActionHandler = async ({ db, clock, subjectId: capsuleId }) => {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) return;
  if (capsule.state !== 'sealed' || capsule.breakGlass !== 'allowed') return;

  await db.update(capsules).set({ state: 'unlocked', updatedAt: clock.now() }).where(eq(capsules.id, capsuleId));
  await audit(db, { actorType: 'system', action: 'capsule.breakglass_opened', subjectType: 'capsule', subjectId: capsuleId });
};
