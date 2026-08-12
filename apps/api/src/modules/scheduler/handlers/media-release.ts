import { eq } from 'drizzle-orm';
import { capsules } from '../../../db/schema/index.js';
import { getMediaRetention, releasesAutomatically } from '../../capsules/index.js';
import { releaseCapsuleMedia } from '../../media/index.js';
import type { ActionHandler } from './dispatch.js';

/**
 * **Automatic media release at the capsule's sealed retention date.**
 *
 * The single most destructive operation in the product, so it re-derives
 * its own authority from the capsule rather than trusting the fact that it
 * was scheduled. A row can outlive the reason it was written: the capsule
 * may have been withdrawn, trashed, purged, or already released by hand,
 * and — the case that matters most — a capsule with no snapshot must never
 * be touched at all.
 *
 * Idempotent by construction. `releaseCapsuleMedia` skips anything already
 * `released`, and the object delete underneath it is an S3 DELETE, which
 * succeeds whether or not the key is still there. Running twice does
 * nothing the first run did not already do.
 */
export const mediaReleaseHandler: ActionHandler = async ({ db, subjectId: capsuleId }) => {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) return; // purged since scheduling — nothing to release.

  // Bound for `purgeCapsuleNow`, which removes objects *and* rows. Releasing
  // in between would half-erase a record already on its way out.
  if (capsule.trashedAt || capsule.state === 'withdrawn') return;

  // The authority check. A legacy capsule (no snapshot) reads as `forever`
  // and `releasesAutomatically` returns false — so even a hand-written or
  // mistakenly-backfilled action row cannot release media from a capsule
  // sealed before this system existed. Nothing retroactive, ever.
  if (!releasesAutomatically(capsule)) return;

  // Guard against firing early. The promoter enqueues up to 5 minutes
  // ahead and `sendAfter` defers execution to `runAt`, but an extend can
  // also have moved the retention date after this row was written; the
  // live column is the one to trust.
  const due = capsule.mediaRetentionUntil ?? getMediaRetention(capsule).until;
  if (due && due.getTime() > Date.now()) return;

  const result = await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

  if (result.failedMediaIds.length > 0) {
    // Throwing hands the row back to `runAction`, which returns it to
    // `pending` for the promoter to retry. Whatever released stays
    // released, so the retry attempts only the stragglers.
    throw new Error(
      `Media release incomplete for capsule ${capsuleId}: ${result.failedMediaIds.length} of ${
        result.released + result.failedMediaIds.length
      } object(s) could not be deleted`,
    );
  }
};
