import { eq } from 'drizzle-orm';
import { audit } from '../../../db/audit.js';
import { capsules } from '../../../db/schema/index.js';
import { purgeCapsuleNow } from '../../capsules/index.js';
import type { ActionHandler } from './dispatch.js';

/**
 * Permanent purge after the 30-day trash/withdraw retention window
 * (`purgeAfter`, set by `trashCapsule`/`withdrawCapsule` in
 * modules/capsules/lifecycle.ts). `purgeCapsuleNow` (shared with T-17's
 * owner-triggered "Delete forever") deletes R2 objects first — DB rows
 * cascade from the `capsules` delete, but object storage doesn't.
 */
export const trashPurgeHandler: ActionHandler = async ({ db, subjectId: capsuleId }) => {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) return; // already purged (e.g. redelivered job).
  if (!capsule.trashedAt && !capsule.withdrawnAt) return; // extended/restored since scheduling — no longer due for purge.

  await purgeCapsuleNow(db, capsuleId);
  await audit(db, { actorType: 'system', action: 'capsule.purged', subjectType: 'capsule', subjectId: capsuleId });
};
