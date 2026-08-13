import { randomUUID } from 'node:crypto';
import type { CompleteMediaRequest, CreateMediaTicketRequest, MediaItem, MediaViewResponse, PatchMediaRequest } from '@tc/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { capsules, mediaItems } from '../../db/schema/index.js';
import {
  assertCanPatch,
  assertCanReleaseMedia,
  assertFileWithinSizeLimit,
  assertWithinStorageQuota,
  cancelPendingMediaRelease,
  commitActualStorageUsage,
  findOwnedCapsuleOrThrow,
  getPlanLimits,
} from '../capsules/index.js';
import { getStorageAdapter } from './get-adapter.js';
import { releaseCapsuleMedia, type ReleaseResult } from './release.js';
import { toMediaItem } from './mappers.js';
import { mimeToKind } from './mime.js';

type MediaRow = typeof mediaItems.$inferSelect;
type CapsuleRow = typeof capsules.$inferSelect;

/** Matches the 8 MB chunking in 03-ARCHITECTURE.md §9's "resumable parts, 8 MB chunks". */
const PART_SIZE_BYTES = 8 * 1024 * 1024;
const VIEW_URL_TTL_SECONDS = 15 * 60; // 03-ARCHITECTURE.md §9: "R2 signed URLs (15-min TTL)"

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

// Exported for `guest-service.ts` (same module — not a cross-module import,
// so the module-boundary rule doesn't apply) rather than duplicated, so an
// owner-path and a guest-path storage key can never drift into two
// different layouts for what is otherwise identical machinery.
export function buildStorageKey(capsuleId: string, mediaId: string, name: string): string {
  return `media/${capsuleId}/${mediaId}/${sanitizeFilename(name)}`;
}

/**
 * Media-item routes (complete/patch/delete/view) are mounted at the
 * top-level `/media/:id` per 03-ARCHITECTURE.md §14, with no capsuleId in
 * the URL — so ownership is resolved by looking the item up first, then
 * confirming its parent capsule belongs to the caller.
 */
async function findOwnedMediaByIdOrThrow(db: Database, ownerId: string, mediaId: string): Promise<{ capsule: CapsuleRow; media: MediaRow }> {
  const [media] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
  if (!media) {
    throw ApiError.notFound('Media item not found');
  }
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, media.capsuleId);
  return { capsule, media };
}

// Exported for `guest-service.ts` — same reasoning as `buildStorageKey`
// above: one place that keeps `capsules.size_bytes` in sync, used by both
// ownership paths, so quota accounting can never disagree between them.
export async function adjustCapsuleSizeBytes(db: Database, capsuleId: string, deltaBytes: number): Promise<void> {
  await db
    .update(capsules)
    .set({ sizeBytes: sql`greatest(${capsules.sizeBytes} + ${deltaBytes}, 0)` })
    .where(eq(capsules.id, capsuleId));
}

/**
 * Not in the original T-10 ticket text or 03-ARCHITECTURE.md §14's route
 * list — added when T-11's composer needed a way to show a capsule's
 * already-uploaded media (for reorder/captions/delete and to survive a
 * page refresh), which nothing else exposed. Mirrors
 * `modules/recipients/service.ts`'s `listRecipients` shape.
 */
export async function listMedia(db: Database, ownerId: string, capsuleId: string): Promise<MediaItem[]> {
  await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId)).orderBy(mediaItems.position);
  return rows.map(toMediaItem);
}

export async function createMediaTicket(
  db: Database,
  ownerId: string,
  capsuleId: string,
  input: CreateMediaTicketRequest,
): Promise<{ mediaId: string; uploadId: string; parts: { partNumber: number; url: string }[] }> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanPatch(capsule);

  const kind = mimeToKind(input.mime);
  await assertFileWithinSizeLimit(db, ownerId, input.sizeBytes);
  await assertWithinStorageQuota(db, ownerId, input.sizeBytes);

  const [{ value: maxPosition } = { value: -1 }] = await db
    .select({ value: sql<number>`coalesce(max(${mediaItems.position}), -1)` })
    .from(mediaItems)
    .where(eq(mediaItems.capsuleId, capsuleId));

  const mediaId = randomUUID();
  const storageKey = buildStorageKey(capsuleId, mediaId, input.name);
  const partCount = Math.max(1, Math.ceil(input.sizeBytes / PART_SIZE_BYTES));

  const created = await getStorageAdapter().createMultipartUpload(storageKey, partCount);

  await db.insert(mediaItems).values({
    id: mediaId,
    capsuleId,
    uploaderId: ownerId,
    kind,
    storageKey,
    originalName: input.name,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    position: input.position ?? maxPosition + 1,
    status: 'uploading',
    // Temporary home for the multipart uploadId until `complete` finalizes
    // this row's real encMeta (client-computed IVs/chunking, 06 §A).
    encMeta: { uploadId: created.uploadId },
  });

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'media.ticket_created',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId },
  });

  return { mediaId, uploadId: created.uploadId, parts: created.parts };
}

export async function completeMedia(
  db: Database,
  ownerId: string,
  mediaId: string,
  input: CompleteMediaRequest,
): Promise<MediaItem> {
  const { capsule, media: row } = await findOwnedMediaByIdOrThrow(db, ownerId, mediaId);
  assertCanPatch(capsule);
  const capsuleId = capsule.id;

  if (row.status !== 'uploading' || !row.storageKey) {
    throw ApiError.notFound('Media item is not awaiting completion');
  }
  const uploadId = (row.encMeta as { uploadId?: string } | null)?.uploadId;
  if (!uploadId) {
    throw ApiError.notFound('Media item is not awaiting completion');
  }

  const adapter = getStorageAdapter();
  await adapter.completeMultipartUpload(row.storageKey, uploadId, input.parts);

  const head = await adapter.headObject(row.storageKey);
  if (!head) {
    throw ApiError.uploadIncomplete('Uploaded object was not found in storage');
  }

  // The authoritative check — audit fix. `assertWithinStorageQuota` above
  // was only ever a pre-upload UX gate against the client's *declared*
  // size; this re-checks against the *real* object size R2 just confirmed,
  // and commits the capsule's size increment atomically with marking the
  // media ready, so a rejection here can never leave one written without
  // the other.
  const limits = await getPlanLimits(db, ownerId);
  const guard = await commitActualStorageUsage(db, eq(capsules.ownerId, ownerId), capsuleId, head.sizeBytes, limits.storageBytes, (tx) =>
    tx
      .update(mediaItems)
      .set({
        status: 'ready',
        sizeBytes: head.sizeBytes,
        encMeta: input.encMeta ?? null,
        durationMs: input.durationMs ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        blurhash: input.blurhash ?? null,
      })
      .where(eq(mediaItems.id, mediaId))
      .returning()
      .then((rows) => rows[0] as MediaRow),
  );

  if (!guard.accepted) {
    // The real upload turned out too big for what's left of the quota —
    // clean up the object and the ticket row rather than leaving either
    // pretending the upload succeeded.
    await adapter.deleteObject(row.storageKey);
    await db.delete(mediaItems).where(eq(mediaItems.id, mediaId));
    throw ApiError.quotaExceeded(`storage_bytes:${limits.storageBytes}:used:${guard.usedBytes}`);
  }

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'media.completed',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId, sizeBytes: head.sizeBytes },
  });

  return toMediaItem(guard.result);
}

export async function patchMedia(db: Database, ownerId: string, mediaId: string, input: PatchMediaRequest): Promise<MediaItem> {
  const { capsule } = await findOwnedMediaByIdOrThrow(db, ownerId, mediaId);
  assertCanPatch(capsule);
  const capsuleId = capsule.id;

  const [updated] = (await db
    .update(mediaItems)
    .set({
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    })
    .where(eq(mediaItems.id, mediaId))
    .returning()) as [MediaRow];

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'media.updated',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId },
  });

  return toMediaItem(updated);
}

export async function deleteMedia(db: Database, ownerId: string, mediaId: string): Promise<void> {
  const { capsule, media: row } = await findOwnedMediaByIdOrThrow(db, ownerId, mediaId);
  assertCanPatch(capsule);
  const capsuleId = capsule.id;

  const adapter = getStorageAdapter();
  if (row.storageKey) {
    if (row.status === 'uploading') {
      const uploadId = (row.encMeta as { uploadId?: string } | null)?.uploadId;
      if (uploadId) {
        await adapter.abortMultipartUpload(row.storageKey, uploadId);
      }
    } else {
      await adapter.deleteObject(row.storageKey);
    }
  }

  await db.delete(mediaItems).where(eq(mediaItems.id, mediaId));

  if (row.status === 'ready' && row.sizeBytes) {
    await adjustCapsuleSizeBytes(db, capsuleId, -row.sizeBytes);
  }

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'media.deleted',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId },
  });
}

/**
 * Owner-initiated early release of everything this capsule still holds in
 * storage (M4). Capsule-level by design: retention is a property of the
 * capsule, and per-enclosure release is deliberately not offered yet.
 *
 * Guarded by `assertCanReleaseMedia`, **not** `assertCanPatch`. The latter
 * is draft-only and stays that way — see the long note on the guard itself
 * for why releasing bytes is not the same operation as editing a sealed
 * capsule.
 */
export async function releaseCapsuleMediaAsOwner(db: Database, ownerId: string, capsuleId: string): Promise<ReleaseResult> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanReleaseMedia(capsule);

  const result = await releaseCapsuleMedia(db, capsuleId, { reason: 'owner', actorId: ownerId });

  // The owner has just done by hand what the schedule existed to do later.
  await cancelPendingMediaRelease(db, capsuleId);

  if (result.failedMediaIds.length > 0) {
    // Reported rather than swallowed: some bytes are still there, and the
    // owner asked for them to be gone. Whatever did release stays released
    // (the rows are already updated), so a retry picks up only the rest.
    throw new ApiError(
      'internal_error',
      `Could not release ${result.failedMediaIds.length} enclosure(s) — please try again`,
      500,
    );
  }

  return result;
}

export async function getMediaViewUrl(db: Database, ownerId: string, mediaId: string): Promise<MediaViewResponse> {
  const { media: row } = await findOwnedMediaByIdOrThrow(db, ownerId, mediaId);
  if (row.status === 'released') {
    // A distinct, true statement. Saying "still uploading or processing"
    // here — which is what the old single branch did — would be a plain
    // lie about a capsule whose bytes were deliberately reclaimed years
    // earlier, and would send the owner looking for a fault that isn't one.
    throw ApiError.mediaReleased();
  }
  if (row.status !== 'ready' || !row.storageKey) {
    throw ApiError.uploadIncomplete('Media is still uploading or processing');
  }

  const url = await getStorageAdapter().getSignedGetUrl(row.storageKey, {
    expiresInSeconds: VIEW_URL_TTL_SECONDS,
    asAttachment: row.kind !== 'image',
    filename: row.originalName ?? undefined,
  });

  return { url, expiresInSeconds: VIEW_URL_TTL_SECONDS };
}
