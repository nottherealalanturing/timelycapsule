import { eq } from 'drizzle-orm';
import { capsuleRecipients, capsules, users } from '../../../db/schema/index.js';
import { sendPreUnlockReminder } from '../../email/index.js';
import type { ActionHandler } from './dispatch.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(unlockAt: Date, now: Date): number {
  return Math.max(1, Math.round((unlockAt.getTime() - now.getTime()) / MS_PER_DAY));
}

/**
 * Pre-unlock reminder (03-ARCHITECTURE.md §11: "T-7d/T-1d recipient opt-in;
 * sender always T-1d"). `subjectId` is either a `capsule_recipients.id`
 * (recipient reminder) or a `capsules.id` (owner reminder, scheduled with
 * subjectId=capsuleId — see lifecycle.ts's `scheduleReminders`) — the two
 * are disjoint UUID spaces, so trying the recipient lookup first and
 * falling back to the capsule lookup unambiguously identifies which.
 */
export const reminderHandler: ActionHandler = async ({ db, clock, subjectId }) => {
  const [recipient] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, subjectId)).limit(1);
  if (recipient) {
    if (recipient.status === 'opened' || recipient.status === 'blocked_suppressed' || !recipient.email) return;
    const optIn = recipient.reminderOptIn as { enabled?: boolean } | null;
    if (optIn && optIn.enabled === false) return;

    const [capsule] = await db.select({ ownerId: capsules.ownerId, unlockAt: capsules.unlockAt }).from(capsules).where(eq(capsules.id, recipient.capsuleId)).limit(1);
    if (!capsule?.unlockAt) return;
    const [owner] = capsule.ownerId
      ? await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, capsule.ownerId)).limit(1)
      : [];

    await sendPreUnlockReminder(db, recipient.email, {
      audience: 'recipient',
      senderName: owner?.displayName ?? 'Someone',
      daysUntilUnlock: daysUntil(capsule.unlockAt, clock.now()),
      unlockAtIso: capsule.unlockAt.toISOString(),
    });
    return;
  }

  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, subjectId)).limit(1);
  if (!capsule?.unlockAt || !capsule.ownerId) return; // capsule was withdrawn/deleted, is an unclaimed guest capsule, or neither a live recipient nor capsule — nothing to remind.

  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, capsule.ownerId)).limit(1);
  if (!owner) return;

  await sendPreUnlockReminder(db, owner.email, {
    audience: 'owner',
    capsuleTitle: capsule.title,
    daysUntilUnlock: daysUntil(capsule.unlockAt, clock.now()),
    unlockAtIso: capsule.unlockAt.toISOString(),
    dashboardUrl: `${process.env.APP_URL ?? 'http://localhost:3001'}/capsule/${capsule.id}`,
  });
};
