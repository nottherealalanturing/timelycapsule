import { eq } from 'drizzle-orm';
import { capsuleRecipients } from '../../../db/schema/index.js';
import type { ActionHandler } from './dispatch.js';
import { stubNotify } from './notify.js';

/** Notifies one recipient that their capsule has unlocked. Idempotent against re-delivery and already-opened recipients. */
export const recipientUnlockHandler: ActionHandler = async ({ db, subjectId: recipientId }) => {
  const [recipient] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipientId)).limit(1);
  if (!recipient) return; // recipient was removed before unlock — nothing to notify.
  if (recipient.status === 'opened' || recipient.status === 'blocked_suppressed') return;

  if (recipient.status === 'added' || recipient.status === 'invited') {
    await db.update(capsuleRecipients).set({ status: 'notified' }).where(eq(capsuleRecipients.id, recipientId));
  }

  await stubNotify(db, {
    action: 'recipient.unlock_notified',
    subjectType: 'capsule',
    subjectId: recipient.capsuleId,
    metadata: { recipientId },
  });
};
