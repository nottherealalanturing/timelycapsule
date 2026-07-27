import { eq } from 'drizzle-orm';
import { audit } from '../../../db/audit.js';
import { capsuleRecipients, capsules, users } from '../../../db/schema/index.js';
import { sendCapsuleUnlocked } from '../../email/index.js';
import type { ActionHandler } from './dispatch.js';

/** Notifies one recipient that their capsule has unlocked. Idempotent against re-delivery and already-opened recipients. */
export const recipientUnlockHandler: ActionHandler = async ({ db, subjectId: recipientId }) => {
  const [recipient] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipientId)).limit(1);
  if (!recipient) return; // recipient was removed before unlock — nothing to notify.
  if (recipient.status === 'opened' || recipient.status === 'blocked_suppressed') return;

  if (recipient.email) {
    const [capsule] = await db.select({ ownerId: capsules.ownerId }).from(capsules).where(eq(capsules.id, recipient.capsuleId)).limit(1);
    const [owner] = capsule?.ownerId
      ? await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, capsule.ownerId)).limit(1)
      : [];
    await sendCapsuleUnlocked(db, recipient.email, { senderName: owner?.displayName ?? 'Someone' });
  }

  if (recipient.status === 'added' || recipient.status === 'invited') {
    await db.update(capsuleRecipients).set({ status: 'notified' }).where(eq(capsuleRecipients.id, recipientId));
  }

  await audit(db, { actorType: 'system', action: 'recipient.unlock_notified', subjectType: 'capsule', subjectId: recipient.capsuleId, metadata: { recipientId } });
};
