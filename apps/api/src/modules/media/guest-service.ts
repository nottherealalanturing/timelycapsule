import { randomUUID } from 'node:crypto';
import type { CompleteMediaRequest, CreateMediaTicketRequest, MediaItem, MediaViewResponse, PatchMediaRequest } from '@tc/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { GUEST_STORAGE_ALLOWANCE_BYTES } from '../../lib/guest-limits.js';
import { capsules, mediaItems } from '../../db/schema/index.js';
import { assertCanPatch, commitActualStorageUsage } from '../capsules/index.js';
import { getStorageAdapter } from './get-adapter.js';
import { adjustCapsuleSizeBytes, buildStorageKey } from './service.js';
import { toMediaItem } from './mappers.js';
import { mimeToKind } from './mime.js';

type MediaRow = typeof mediaItems.$inferSelect;
type CapsuleRow = typeof capsules.$inferSelect;

const PART_SIZE_BYTES = 8 * 1024 * 1024;
const VIEW_URL_TTL_SECONDS = 15 * 60;

/**
 * **Guest media — the same pipeline the authenticated composer uses, scoped
 * to a `guestSessionId` instead of an `ownerId`.**
 *
 * Deliberately a parallel set of functions rather than a generic "owner or
 * guest" parameter threaded through `service.ts`. The authenticated path's
 * `findOwnedCapsuleOrThrow`/`getPlanLimits`/`assertWithinStorageQuota` are
 * all keyed on a real `users.id` with a real `entitlements` row behind it —
 * a guest has neither, and bending those functions to also accept a guest
 * session would mean either a fake user id (a genuine security smell: a
 * guest impersonating a "user" that doesn't exist) or a runtime branch
 * inside every one of them. Two small, explicit call sites are safer than
 * one function silently serving two different trust boundaries.
 *
 * What *is* shared, deliberately, is everything that isn't about identity:
 * `buildStorageKey`/`adjustCapsuleSizeBytes` (`service.ts`, same module),
 * `mimeToKind`, `toMediaItem`, `getStorageAdapter`, the multipart chunking
 * size, the view-URL TTL, and — most importantly — `assertCanPatch`, which
 * only ever asks "is this capsule still a draft" and has never cared who
 * owns it.
 */
async function findOwnedGuestCapsuleOrThrow(db: Database, guestSessionId: string, capsuleId: string): Promise<CapsuleRow> {
  const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  // Same 404-on-mismatch shape as every other ownership check in this
  // codebase — a capsule that exists but belongs to a different guest
  // session must be indistinguishable from one that doesn't exist at all.
  if (!row || row.guestSessionId !== guestSessionId) {
    throw ApiError.notFound('Capsule not found');
  }
  return row;
}

async function findOwnedGuestMediaByIdOrThrow(
  db: Database,
  guestSessionId: string,
  mediaId: string,
): Promise<{ capsule: CapsuleRow; media: MediaRow }> {
  const [media] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
  if (!media) {
    throw ApiError.notFound('Media item not found');
  }
  const capsule = await findOwnedGuestCapsuleOrThrow(db, guestSessionId, media.capsuleId);
  return { capsule, media };
}

/**
 * The whole of Guest's quota policy: 5 MB, total, for the one capsule a
 * session may ever hold. No separate per-file cap — inventing one that
 * hasn't actually been decided would be worse than the total already being
 * the tightest bound in the product; a single file over 5 MB fails this
 * check on its own.
 */
async function assertGuestWithinQuota(db: Database, capsuleId: string, additionalBytes: number): Promise<void> {
  const [row] = await db.select({ sizeBytes: capsules.sizeBytes }).from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  const used = row?.sizeBytes ?? 0;
  if (used + additionalBytes > GUEST_STORAGE_ALLOWANCE_BYTES) {
    throw ApiError.guestQuotaExceeded(used, GUEST_STORAGE_ALLOWANCE_BYTES);
  }
}

export async function listGuestMedia(db: Database, guestSessionId: string, capsuleId: string): Promise<MediaItem[]> {
  await findOwnedGuestCapsuleOrThrow(db, guestSessionId, capsuleId);
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId)).orderBy(mediaItems.position);
  return rows.map(toMediaItem);
}

export async function createGuestMediaTicket(
  db: Database,
  guestSessionId: string,
  capsuleId: string,
  input: CreateMediaTicketRequest,
): Promise<{ mediaId: string; uploadId: string; parts: { partNumber: number; url: string }[] }> {
  const capsule = await findOwnedGuestCapsuleOrThrow(db, guestSessionId, capsuleId);
  assertCanPatch(capsule);

  const kind = mimeToKind(input.mime);
  await assertGuestWithinQuota(db, capsuleId, input.sizeBytes);

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
    // No uploader — no user exists yet. Nullable since M5 (see the schema
    // comment on `media_items.uploader_id`), left null even after a later
    // claim: ownership lives on the capsule row, not here.
    uploaderId: null,
    kind,
    storageKey,
    originalName: input.name,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    position: input.position ?? maxPosition + 1,
    status: 'uploading',
    encMeta: { uploadId: created.uploadId },
  });

  await audit(db, {
    actorType: 'guest',
    actorId: guestSessionId,
    action: 'media.ticket_created',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId },
  });

  return { mediaId, uploadId: created.uploadId, parts: created.parts };
}

export async function completeGuestMedia(
  db: Database,
  guestSessionId: string,
  mediaId: string,
  input: CompleteMediaRequest,
): Promise<MediaItem> {
  const { capsule, media: row } = await findOwnedGuestMediaByIdOrThrow(db, guestSessionId, mediaId);
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

  // Same authoritative re-check the owner path now does — see the doc
  // comment on `commitActualStorageUsage`. `assertGuestWithinQuota` above
  // only ever guarded the client's *declared* size at ticket time.
  const guard = await commitActualStorageUsage(
    db,
    eq(capsules.guestSessionId, guestSessionId),
    capsuleId,
    head.sizeBytes,
    GUEST_STORAGE_ALLOWANCE_BYTES,
    (tx) =>
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
    await adapter.deleteObject(row.storageKey);
    await db.delete(mediaItems).where(eq(mediaItems.id, mediaId));
    throw ApiError.guestQuotaExceeded(guard.usedBytes, GUEST_STORAGE_ALLOWANCE_BYTES);
  }

  await audit(db, {
    actorType: 'guest',
    actorId: guestSessionId,
    action: 'media.completed',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId, sizeBytes: head.sizeBytes },
  });

  return toMediaItem(guard.result);
}

export async function patchGuestMedia(
  db: Database,
  guestSessionId: string,
  mediaId: string,
  input: PatchMediaRequest,
): Promise<MediaItem> {
  const { capsule } = await findOwnedGuestMediaByIdOrThrow(db, guestSessionId, mediaId);
  assertCanPatch(capsule);

  const [updated] = (await db
    .update(mediaItems)
    .set({
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    })
    .where(eq(mediaItems.id, mediaId))
    .returning()) as [MediaRow];

  return toMediaItem(updated);
}

export async function deleteGuestMedia(db: Database, guestSessionId: string, mediaId: string): Promise<void> {
  const { capsule, media: row } = await findOwnedGuestMediaByIdOrThrow(db, guestSessionId, mediaId);
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
    actorType: 'guest',
    actorId: guestSessionId,
    action: 'media.deleted',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { mediaId },
  });
}

export async function getGuestMediaViewUrl(db: Database, guestSessionId: string, mediaId: string): Promise<MediaViewResponse> {
  const { media: row } = await findOwnedGuestMediaByIdOrThrow(db, guestSessionId, mediaId);
  if (row.status === 'released') {
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
