import { eq } from 'drizzle-orm';
import { capsules } from '../../../db/schema/index.js';
import type { ActionHandler } from './dispatch.js';
import { stubNotify } from './notify.js';

/** Fires when a capsule seals with `announceOnSeal` set — "something is waiting for you" notice. Real templates are T-14's job. */
export const announceHandler: ActionHandler = async ({ db, subjectId: capsuleId }) => {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) return;

  await stubNotify(db, { action: 'capsule.announced', subjectType: 'capsule', subjectId: capsuleId });
};
