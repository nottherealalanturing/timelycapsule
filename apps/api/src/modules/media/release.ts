import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { logger } from '../../logger.js';
import { capsules, mediaItems } from '../../db/schema/index.js';
import { getStorageAdapter } from './get-adapter.js';

type MediaRow = typeof mediaItems.$inferSelect;

export type ReleaseReason = 'retention' | 'owner';

export interface ReleaseResult {
  /** Rows that held bytes and now do not. */
  released: number;
  /** Rows already released before this run — the idempotent path. */
  alreadyReleased: number;
  /** Rows that never held bytes to reclaim (uploading/failed/infected). Left exactly as they are. */
  skipped: number;
  /** Media ids whose objects could not be deleted. Non-empty means the caller must throw so the action retries. */
  failedMediaIds: string[];
  bytesReclaimed: number;
}

/**
 * **Release: reclaim the bytes, keep the record.**
 *
 * The distinction this whole milestone turns on. Releasing media deletes
 * the encrypted blobs, thumbnails and transcoded derivatives from object
 * storage and *nothing else*. The capsule, the letter, its metadata,
 * timestamps, hallmarks, history, the replies written back to it, and the
 * enclosure rows themselves — filename, size, caption, kind, position, the
 * date it was enclosed — all survive permanently. A released enclosure is
 * not a deleted one; it is one the product can still describe honestly, and
 * says so on every surface rather than quietly vanishing.
 *
 * Note this is not `deleteMedia`. That removes the row too, is gated by
 * `assertCanPatch` (draft-only), and is the right verb for "I changed my
 * mind about enclosing this". Release is the right verb for "the custody
 * term this capsule was sealed with has ended".
 *
 * ## Why the object is deleted before the row is updated
 *
 * Two orderings are possible and only one of them is safe.
 *
 *   - **Object first, row second (this one).** If the delete succeeds and
 *     the update then fails, a retry re-issues the delete — which S3/R2
 *     answer with 204 whether or not the key was still there, so it is
 *     genuinely idempotent — and re-applies the update. It converges. The
 *     invariant that falls out is worth stating: *a row marked `released`
 *     is proof the delete already returned successfully.*
 *   - Row first, object second. A crash between them leaves a row claiming
 *     the bytes are gone while they sit in the bucket costing money, with
 *     nothing left in the system that knows to look. Silent, permanent,
 *     and invisible.
 *
 * ## Partial failure
 *
 * Items are independent. One object refusing to delete must not strand the
 * other nine, so failures are collected rather than thrown, and the caller
 * decides. The scheduled handler throws when `failedMediaIds` is non-empty,
 * which returns the action to `pending` for the promoter to retry; on that
 * retry the already-released items take the `alreadyReleased` path and only
 * the stragglers are attempted again.
 */
export async function releaseCapsuleMedia(
  db: Database,
  capsuleId: string,
  options: { reason: ReleaseReason; actorId?: string },
): Promise<ReleaseResult> {
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
  const adapter = getStorageAdapter();

  const result: ReleaseResult = {
    released: 0,
    alreadyReleased: 0,
    skipped: 0,
    failedMediaIds: [],
    bytesReclaimed: 0,
  };

  for (const row of rows) {
    if (row.status === 'released') {
      result.alreadyReleased += 1;
      continue;
    }
    // Only a `ready` item has bytes that were ever really there. An
    // `uploading`/`failed`/`infected` row is left untouched: marking it
    // released would claim we reclaimed something that never landed, and
    // the export would then report it dishonestly.
    if (row.status !== 'ready') {
      result.skipped += 1;
      continue;
    }

    try {
      await deleteAllObjectsFor(row, adapter);
    } catch (err) {
      // Collected, not thrown — the next item may well succeed, and the
      // caller re-runs this whole function later for whatever is left.
      logger.error({ event: 'media_release_object_delete_failed', mediaId: row.id, capsuleId, err }, 'Could not delete media object');
      result.failedMediaIds.push(row.id);
      continue;
    }

    const reclaimed = row.sizeBytes ?? 0;

    await db
      .update(mediaItems)
      .set({
        status: 'released',
        releasedAt: new Date(),
        releaseReason: options.reason,
        // The objects are gone; a key left pointing at them can only ever
        // produce a confusing 404 on some future read. `originalName`,
        // `sizeBytes`, `caption`, `kind` and `position` all stay — that is
        // the record the capsule keeps.
        storageKey: null,
        thumbKey: null,
        previewKey: null,
        hlsKey: null,
      })
      .where(eq(mediaItems.id, row.id));

    // Storage is genuinely reclaimed, so the account's live usage must fall
    // — otherwise "released" would be a label rather than a fact, and the
    // owner would still be paying for bytes that no longer exist.
    if (reclaimed > 0) {
      await db
        .update(capsules)
        .set({ sizeBytes: sql`greatest(${capsules.sizeBytes} - ${reclaimed}, 0)` })
        .where(eq(capsules.id, capsuleId));
    }

    result.released += 1;
    result.bytesReclaimed += reclaimed;
  }

  if (result.released > 0) {
    await audit(db, {
      actorType: options.actorId ? 'user' : 'system',
      actorId: options.actorId,
      action: 'capsule.media_released',
      subjectType: 'capsule',
      subjectId: capsuleId,
      // Metadata only. Nothing here names a file, quotes a caption, or
      // touches capsule content.
      metadata: { reason: options.reason, count: result.released, bytesReclaimed: result.bytesReclaimed },
    });
  }

  return result;
}

/**
 * Every object this row owns: the encrypted blob plus any thumbnail,
 * preview or HLS derivative. Derivatives are listed explicitly rather than
 * assumed absent — none are generated today, but a row that grows one later
 * must not quietly leave it behind in the bucket after its parent is
 * released.
 */
async function deleteAllObjectsFor(row: MediaRow, adapter: ReturnType<typeof getStorageAdapter>): Promise<void> {
  const keys = [row.storageKey, row.thumbKey, row.previewKey, row.hlsKey].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    await adapter.deleteObject(key);
  }
}

/** True when the capsule holds at least one enclosure whose bytes are still in storage — i.e. there is something to release. */
export async function hasReleasableMedia(db: Database, capsuleId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(and(eq(mediaItems.capsuleId, capsuleId), inArray(mediaItems.status, ['ready'])))
    .limit(1);
  return Boolean(row);
}
