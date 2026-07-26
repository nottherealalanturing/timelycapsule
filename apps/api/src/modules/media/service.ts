import { randomUUID } from 'node:crypto';
import type { CompleteMediaRequest, CreateMediaTicketRequest, MediaItem, MediaViewResponse, PatchMediaRequest } from '@tc/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { capsules, mediaItems } from '../../db/schema/index.js';
import { assertCanPatch, assertFileWithinSizeLimit, assertWithinStorageQuota, findOwnedCapsuleOrThrow } from '../capsules/index.js';
import { getStorageAdapter } from './get-adapter.js';
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

function buildStorageKey(capsuleId: string, mediaId: string, name: string): string {
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

async function adjustCapsuleSizeBytes(db: Database, capsuleId: string, deltaBytes: number): Promise<void> {
  await db
    .update(capsules)
    .set({ sizeBytes: sql`greatest(${capsules.sizeBytes} + ${deltaBytes}, 0)` })
    .where(eq(capsules.id, capsuleId));
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

  const [updated] = (await db
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
    .returning()) as [MediaRow];

  await adjustCapsuleSizeBytes(db, capsuleId, head.sizeBytes);

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'media.completed',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId, sizeBytes: head.sizeBytes },
  });

  return toMediaItem(updated);
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

export async function getMediaViewUrl(db: Database, ownerId: string, mediaId: string): Promise<MediaViewResponse> {
  const { media: row } = await findOwnedMediaByIdOrThrow(db, ownerId, mediaId);
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
