import type { Capsule, CreateCapsuleRequest, ListCapsulesQuery, PatchCapsuleRequest } from '@tc/contracts';
import { and, desc, eq, ilike, inArray, lt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { buildPage, decodeCursor, type PageResult } from '../../lib/pagination.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleTags, capsules, tags } from '../../db/schema/index.js';
import { generateUniquePublicId } from './public-id.js';
import { getPlanLimits } from './entitlements.js';
import { validateSeals, extractPassphraseHint } from './seals.js';
import { assertCanArchive, assertCanDuplicate, assertCanPatch, assertCanUnarchive, assertUnlockAtWithinBounds } from './state-machine.js';
import { recordVersionSnapshot } from './versions.js';
import { toCapsule, toCapsuleListItem } from './mappers.js';

type CapsuleRow = typeof capsules.$inferSelect;

/** Draft-editable field set — what's copyable on duplicate, and what a version snapshot captures. */
const DRAFT_FIELDS = [
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

  const rows = await db
    .select()
    .from(capsules)
    .where(and(...conditions))
    .orderBy(desc(capsules.createdAt))
    .limit(query.limit + 1);

  const page = buildPage(rows, query.limit, (row) => row.createdAt.toISOString());
  return { data: page.data.map(toCapsuleListItem), nextCursor: page.nextCursor };
}

export async function getCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  return toCapsule(row);
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
