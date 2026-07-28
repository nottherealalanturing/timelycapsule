import type { Collection, CreateCollectionRequest, PatchCollectionRequest } from '@tc/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { collectionItems, collections } from '../../db/schema/index.js';
import { findOwnedCapsuleOrThrow } from '../capsules/index.js';
import { toCollection } from './mappers.js';

type CollectionRow = typeof collections.$inferSelect;

async function findOwnedCollectionOrThrow(db: Database, ownerId: string, collectionId: string): Promise<CollectionRow> {
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, ownerId)))
    .limit(1);
  if (!row) throw ApiError.notFound('Collection not found');
  return row;
}

async function capsuleCounts(db: Database, collectionIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (collectionIds.length === 0) return counts;

  const rows = await db
    .select({ collectionId: collectionItems.collectionId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(collectionItems)
    .where(inArray(collectionItems.collectionId, collectionIds))
    .groupBy(collectionItems.collectionId);

  for (const row of rows) counts.set(row.collectionId, row.count);
  return counts;
}

export async function listCollections(db: Database, ownerId: string): Promise<Collection[]> {
  const rows = await db.select().from(collections).where(eq(collections.userId, ownerId)).orderBy(collections.position);
  const counts = await capsuleCounts(db, rows.map((r) => r.id));
  return rows.map((row) => toCollection(row, counts.get(row.id) ?? 0));
}

export async function createCollection(db: Database, ownerId: string, input: CreateCollectionRequest): Promise<Collection> {
  const maxRows = await db
    .select({ maxPosition: sql<number>`coalesce(max(${collections.position}), -1)`.mapWith(Number) })
    .from(collections)
    .where(eq(collections.userId, ownerId));
  const maxPosition = maxRows[0]?.maxPosition ?? -1;

  const [row] = (await db
    .insert(collections)
    .values({ userId: ownerId, name: input.name, cover: input.cover, position: maxPosition + 1 })
    .returning()) as [CollectionRow];
  return toCollection(row, 0);
}

export async function patchCollection(
  db: Database,
  ownerId: string,
  collectionId: string,
  input: PatchCollectionRequest,
): Promise<Collection> {
  await findOwnedCollectionOrThrow(db, ownerId, collectionId);
  const [row] = (await db.update(collections).set(input).where(eq(collections.id, collectionId)).returning()) as [CollectionRow];
  const counts = await capsuleCounts(db, [collectionId]);
  return toCollection(row, counts.get(collectionId) ?? 0);
}

/** Deletes the collection itself — capsules inside it are untouched (02-UX-DESIGN.md §5.10: "delete keeps capsules"). */
export async function deleteCollection(db: Database, ownerId: string, collectionId: string): Promise<void> {
  await findOwnedCollectionOrThrow(db, ownerId, collectionId);
  await db.delete(collections).where(eq(collections.id, collectionId));
}

export async function addCollectionItem(db: Database, ownerId: string, collectionId: string, capsuleId: string): Promise<void> {
  await findOwnedCollectionOrThrow(db, ownerId, collectionId);
  await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);

  const maxRows = await db
    .select({ maxPosition: sql<number>`coalesce(max(${collectionItems.position}), -1)`.mapWith(Number) })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId));
  const maxPosition = maxRows[0]?.maxPosition ?? -1;

  await db.insert(collectionItems).values({ collectionId, capsuleId, position: maxPosition + 1 }).onConflictDoNothing();
}

export async function removeCollectionItem(db: Database, ownerId: string, collectionId: string, capsuleId: string): Promise<void> {
  await findOwnedCollectionOrThrow(db, ownerId, collectionId);
  await db
    .delete(collectionItems)
    .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.capsuleId, capsuleId)));
}

/** Full reorder — `capsuleIds` must be exactly the collection's current member set, just in the desired order. */
export async function reorderCollectionItems(db: Database, ownerId: string, collectionId: string, capsuleIds: string[]): Promise<void> {
  await findOwnedCollectionOrThrow(db, ownerId, collectionId);

  const current = await db
    .select({ capsuleId: collectionItems.capsuleId })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId));
  const currentIds = new Set(current.map((r) => r.capsuleId));

  if (capsuleIds.length !== currentIds.size || capsuleIds.some((id) => !currentIds.has(id))) {
    throw ApiError.validationFailed('capsuleIds must exactly match the collection’s current members');
  }

  await db.transaction(async (tx) => {
    for (const [index, capsuleId] of capsuleIds.entries()) {
      await tx
        .update(collectionItems)
        .set({ position: index })
        .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.capsuleId, capsuleId)));
    }
  });
}
