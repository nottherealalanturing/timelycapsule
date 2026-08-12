import { eq } from 'drizzle-orm';
import { capsules, users } from '../../../db/schema/index.js';
import { releasesAutomatically } from '../../capsules/index.js';
import { hasReleasableMedia } from '../../media/index.js';
import { sendMediaReleaseWarning } from '../../email/index.js';
import { writeNotification } from '../../notifications/index.js';
import type { ActionHandler } from './dispatch.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tells the owner, ahead of time, that a capsule's enclosures are due to be
 * released — 30 days out and again at 7.
 *
 * **Carries metadata only.** No letter text, no reply text, no filenames,
 * no captions, no media. The whole product is built on the server not being
 * able to read any of that, and an email is the last place to start. What
 * it can honestly say is: which capsule (by its own title, which the owner
 * chose and which never reaches a recipient), when the release happens, and
 * what can be done about it.
 *
 * Scheduled as two separate `scheduled_actions` rows rather than one row
 * that reschedules itself, so each warning is independently retryable and a
 * missed 30-day notice cannot swallow the 7-day one.
 */
export const mediaReleaseWarningHandler: ActionHandler = async ({ db, clock, subjectId: capsuleId }) => {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) return;
  if (capsule.trashedAt || capsule.state === 'withdrawn') return;
  if (!capsule.ownerId) return; // unclaimed guest capsule — nobody to warn.

  // Nothing to warn about if the promise says forever, or if the owner has
  // already released by hand since this was scheduled. Warning about a
  // release that will not happen is worse than not warning at all.
  if (!releasesAutomatically(capsule)) return;
  if (!(await hasReleasableMedia(db, capsuleId))) return;

  const releaseAt = capsule.mediaRetentionUntil;
  if (!releaseAt) return;

  const daysUntil = Math.max(1, Math.round((releaseAt.getTime() - clock.now().getTime()) / MS_PER_DAY));

  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, capsule.ownerId)).limit(1);
  if (!owner) return;

  await writeNotification(db, {
    userId: capsule.ownerId,
    category: 'delivery',
    title: 'Enclosures due to be released',
    data: { capsuleId, releaseAt: releaseAt.toISOString(), daysUntil },
  });

  await sendMediaReleaseWarning(db, owner.email, {
    capsuleTitle: capsule.title,
    daysUntilRelease: daysUntil,
    releaseAtIso: releaseAt.toISOString(),
    capsuleUrl: `${process.env.APP_URL ?? 'http://localhost:3001'}/capsule/${capsule.id}`,
  });
};
