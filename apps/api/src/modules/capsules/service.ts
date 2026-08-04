import type { Capsule, CreateCapsuleRequest, ListCapsulesQuery, PatchCapsuleRequest } from '@tc/contracts';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { buildPage, decodeCursor, type PageResult } from '../../lib/pagination.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleTags, capsules, collectionItems, favorites, tags } from '../../db/schema/index.js';
import { generateUniquePublicId } from './public-id.js';
import { getPlanLimits } from './entitlements.js';
import { validateSeals, extractPassphraseHint } from './seals.js';
import { assertCanArchive, assertCanDuplicate, assertCanPatch, assertCanUnarchive, assertUnlockAtWithinBounds } from './state-machine.js';
import { recordVersionSnapshot } from './versions.js';
import { toCapsule, toCapsuleListItem, type CapsuleOrgExtra } from './mappers.js';

type CapsuleRow = typeof capsules.$inferSelect;

/** Draft-editable field set — what's copyable on duplicate, and what a version snapshot captures. */
const DRAFT_FIELDS = [
  'type',
  'title',
  'cover',
  'teaser',
  'contentDocEnc',
  'ownerKeyWrap',
  'passphraseHint',
  'unlockMode',
  'unlockAt',
  'unlockLocal',
  'seals',
  'allowDownload',
  'recipientsVisible',
  'announceOnSeal',
  'requireRecipientVerification',
  'replyPrompt',
  'location',
  'expiresAfter',
  'expiryStrict',
  'legacyConfig',
] as const satisfies readonly (keyof CapsuleRow)[];

function snapshotOf(row: CapsuleRow): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of DRAFT_FIELDS) {
    snapshot[field] = row[field];
  }
  return snapshot;
}

export async function findOwnedCapsuleOrThrow(db: Database, ownerId: string, capsuleId: string): Promise<CapsuleRow> {
  const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!row || row.ownerId !== ownerId) {
    throw ApiError.notFound('Capsule not found');
  }
  return row;
}

export async function createCapsule(db: Database, ownerId: string, input: CreateCapsuleRequest): Promise<Capsule> {
  const publicId = await generateUniquePublicId(db);
  const [row] = (await db
    .insert(capsules)
    .values({ ownerId, type: input.type, publicId, state: 'draft' })
    .returning()) as [CapsuleRow];

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.created', subjectType: 'capsule', subjectId: row.id });
  return toCapsule(row);
}

/** Favorite-set + tagIds-per-capsule for a batch of capsules — shared by listCapsules (batch) and getCapsule (single). */
async function loadOrgExtras(db: Database, ownerId: string, capsuleIds: string[]): Promise<Map<string, CapsuleOrgExtra>> {
  const extras = new Map<string, CapsuleOrgExtra>();
  if (capsuleIds.length === 0) return extras;

  const [favoriteRows, tagRows] = await Promise.all([
    db.select({ capsuleId: favorites.capsuleId }).from(favorites).where(and(eq(favorites.userId, ownerId), inArray(favorites.capsuleId, capsuleIds))),
    db.select({ capsuleId: capsuleTags.capsuleId, tagId: capsuleTags.tagId }).from(capsuleTags).where(inArray(capsuleTags.capsuleId, capsuleIds)),
  ]);

  for (const id of capsuleIds) extras.set(id, { isFavorite: false, tagIds: [] });
  for (const row of favoriteRows) extras.get(row.capsuleId)!.isFavorite = true;
  for (const row of tagRows) extras.get(row.capsuleId)!.tagIds!.push(row.tagId);
  return extras;
}

export async function listCapsules(
  db: Database,
  ownerId: string,
  query: ListCapsulesQuery,
): Promise<PageResult<ReturnType<typeof toCapsuleListItem>>> {
  const conditions = [eq(capsules.ownerId, ownerId)];
  if (query.state) conditions.push(eq(capsules.state, query.state));
  if (query.type) conditions.push(eq(capsules.type, query.type));
  if (query.q) conditions.push(ilike(capsules.title, `%${query.q}%`));
  if (query.cursor) conditions.push(lt(capsules.createdAt, new Date(decodeCursor(query.cursor))));

  // `view` scopes the timeline the way §5.10's Archive/Trash pages need
  // (archivedAt/trashedAt are independent side-flags, not part of `state`).
  // A collection is its own filtering dimension — it should show archived
  // members too (only trashed/deleted capsules are excluded everywhere),
  // so the default "active" exclusion only applies to the plain timeline.
  if (query.view === 'archived') {
    conditions.push(isNotNull(capsules.archivedAt));
  } else if (query.view === 'trashed') {
    conditions.push(isNotNull(capsules.trashedAt));
  } else if (query.collectionId) {
    conditions.push(isNull(capsules.trashedAt));
  } else {
    conditions.push(isNull(capsules.archivedAt));
    conditions.push(isNull(capsules.trashedAt));
  }

  if (query.tag) {
    const tagRows = await db
      .select({ capsuleId: capsuleTags.capsuleId })
      .from(capsuleTags)
      .innerJoin(tags, eq(tags.id, capsuleTags.tagId))
      .where(and(eq(tags.userId, ownerId), eq(tags.name, query.tag)));
    const ids = tagRows.map((r) => r.capsuleId);
    if (ids.length === 0) {
      return { data: [], nextCursor: null };
    }
    conditions.push(inArray(capsules.id, ids));
  }

  if (query.favorite) {
    const favRows = await db.select({ capsuleId: favorites.capsuleId }).from(favorites).where(eq(favorites.userId, ownerId));
    const ids = favRows.map((r) => r.capsuleId);
    if (ids.length === 0) {
      return { data: [], nextCursor: null };
    }
    conditions.push(inArray(capsules.id, ids));
  }

  if (query.collectionId) {
    // A collection's own manual order (drag/up-down reorder) takes priority
    // over the usual createdAt timeline ordering — small, unpaginated lists,
    // matching 02-UX-DESIGN.md §5.10's "collection detail = filtered timeline".
    const itemRows = await db
      .select({ capsuleId: collectionItems.capsuleId, position: collectionItems.position })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, query.collectionId))
      .orderBy(collectionItems.position);
    const orderedIds = itemRows.map((r) => r.capsuleId);
    if (orderedIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    const rows = await db
      .select()
      .from(capsules)
      .where(and(...conditions, inArray(capsules.id, orderedIds)));
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const ordered = orderedIds.map((id) => rowsById.get(id)).filter((row): row is CapsuleRow => Boolean(row));

    const extras = await loadOrgExtras(db, ownerId, ordered.map((row) => row.id));
    return { data: ordered.map((row) => toCapsuleListItem(row, extras.get(row.id))), nextCursor: null };
  }

  const rows = await db
    .select()
    .from(capsules)
    .where(and(...conditions))
    .orderBy(desc(capsules.createdAt))
    .limit(query.limit + 1);

  const page = buildPage(rows, query.limit, (row) => row.createdAt.toISOString());
  const extras = await loadOrgExtras(db, ownerId, page.data.map((row) => row.id));
  return { data: page.data.map((row) => toCapsuleListItem(row, extras.get(row.id))), nextCursor: page.nextCursor };
}

export async function getCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  const extras = await loadOrgExtras(db, ownerId, [capsuleId]);
  return toCapsule(row, extras.get(capsuleId));
}

/**
 * One-time post-claim key attach (T-15b) — see SetOwnerKeyWrapRequestSchema
 * for why this is deliberately state-independent (allowed even sealed) but
 * still refuses to overwrite an existing wrap.
 */
export async function setOwnerKeyWrap(db: Database, ownerId: string, capsuleId: string, ownerKeyWrap: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  if (row.ownerKeyWrap) {
    throw ApiError.ownerKeyWrapAlreadySet();
  }

  const [updated] = (await db
    .update(capsules)
    .set({ ownerKeyWrap: Buffer.from(ownerKeyWrap, 'base64'), updatedAt: new Date() })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.owner_key_wrap_attached', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}

export async function patchCapsule(
  db: Database,
  ownerId: string,
  capsuleId: string,
  patch: PatchCapsuleRequest,
): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanPatch(row);

  if (patch.unlockAt) {
    assertUnlockAtWithinBounds(new Date(patch.unlockAt));
  }
  if (patch.seals) {
    const limits = await getPlanLimits(db, ownerId);
    validateSeals(patch.seals, row.type, limits);
  }

  await recordVersionSnapshot(db, capsuleId, snapshotOf(row));

  const updateValues: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (patch.unlockAt !== undefined) {
    updateValues.unlockAt = patch.unlockAt ? new Date(patch.unlockAt) : null;
  }
  // contentDocEnc/ownerKeyWrap are bytea columns; the wire format is base64
  // (see mappers.ts's outbound base64OrNull) but nothing decoded it back on
  // the way in — every PATCH was writing the raw base64 *text* into a bytea
  // column instead of the decoded bytes.
  if (patch.contentDocEnc !== undefined) {
    updateValues.contentDocEnc = patch.contentDocEnc ? Buffer.from(patch.contentDocEnc, 'base64') : null;
  }
  if (patch.ownerKeyWrap !== undefined) {
    updateValues.ownerKeyWrap = patch.ownerKeyWrap ? Buffer.from(patch.ownerKeyWrap, 'base64') : null;
  }
  if (patch.seals) {
    updateValues.passphraseHint = extractPassphraseHint(patch.seals);
  }

  const [updated] = (await db.update(capsules).set(updateValues).where(eq(capsules.id, capsuleId)).returning()) as [CapsuleRow];

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.updated', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}

export async function duplicateCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanDuplicate(row);

  const publicId = await generateUniquePublicId(db);
  const copyableFields = snapshotOf(row);
  const [created] = (await db
    .insert(capsules)
    .values({ ownerId, type: row.type, publicId, state: 'draft', ...copyableFields })
    .returning()) as [CapsuleRow];

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'capsule.duplicated',
    subjectType: 'capsule',
    subjectId: created.id,
    metadata: { sourceCapsuleId: capsuleId },
  });
  return toCapsule(created);
}

export async function archiveCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanArchive(row);
  const [updated] = (await db
    .update(capsules)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];
  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.archived', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}

export async function unarchiveCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanUnarchive(row);
  const [updated] = (await db
    .update(capsules)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];
  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.unarchived', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}
