import { eq } from 'drizzle-orm';
import { capsuleRecipients } from '../../../db/schema/index.js';
import type { ActionHandler } from './dispatch.js';
import { stubNotify } from './notify.js';

/**
 * Pre-unlock reminder to an opted-in recipient. The T-7d/T-1d scheduling
 * cadence itself is T-14's job (nothing yet inserts `reminder` rows) — this
 * handler just needs to process one correctly once T-14 starts scheduling them.
 */
export const reminderHandler: ActionHandler = async ({ db, subjectId: recipientId }) => {
  const [recipient] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipientId)).limit(1);
  if (!recipient) return;
  if (recipient.status === 'opened' || recipient.status === 'blocked_suppressed') return;
  const optIn = recipient.reminderOptIn as { enabled?: boolean } | null;
  if (optIn && optIn.enabled === false) return;

  await stubNotify(db, { action: 'recipient.reminder_sent', subjectType: 'capsule', subjectId: recipient.capsuleId, metadata: { recipientId } });
};
