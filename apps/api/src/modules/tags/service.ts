import type { Tag } from '@tc/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleTags, tags } from '../../db/schema/index.js';
import { findOwnedCapsuleOrThrow } from '../capsules/index.js';
import { toTag } from './mappers.js';

type TagRow = typeof tags.$inferSelect;

async function findOwnedTagOrThrow(db: Database, ownerId: string, tagId: string): Promise<TagRow> {
  const [row] = await db.select().from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, ownerId))).limit(1);
  if (!row) throw ApiError.notFound('Tag not found');
  return row;
}

export async function listTags(db: Database, ownerId: string): Promise<Tag[]> {
  const rows = await db.select().from(tags).where(eq(tags.userId, ownerId));
  return rows.map(toTag);
}

export async function createTag(db: Database, ownerId: string, name: string): Promise<Tag> {
  const [existing] = await db.select().from(tags).where(and(eq(tags.userId, ownerId), eq(tags.name, name))).limit(1);
  if (existing) throw ApiError.tagAlreadyExists();

  const [row] = (await db.insert(tags).values({ userId: ownerId, name }).returning()) as [TagRow];
  return toTag(row);
}

export async function patchTag(db: Database, ownerId: string, tagId: string, name: string): Promise<Tag> {
  await findOwnedTagOrThrow(db, ownerId, tagId);
  const [existing] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, ownerId), eq(tags.name, name)))
    .limit(1);
  if (existing && existing.id !== tagId) throw ApiError.tagAlreadyExists();

  const [row] = (await db.update(tags).set({ name }).where(eq(tags.id, tagId)).returning()) as [TagRow];
  return toTag(row);
}

export async function deleteTag(db: Database, ownerId: string, tagId: string): Promise<void> {
  await findOwnedTagOrThrow(db, ownerId, tagId);
  await db.delete(tags).where(eq(tags.id, tagId));
}

/** Replaces a capsule's full tag set — every id must belong to the caller's own tags. */
export async function putCapsuleTags(db: Database, ownerId: string, capsuleId: string, tagIds: string[]): Promise<void> {
  await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);

  if (tagIds.length > 0) {
    const owned = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.userId, ownerId), inArray(tags.id, tagIds)));
    if (owned.length !== new Set(tagIds).size) {
      throw ApiError.notFound('One or more tags not found');
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(capsuleTags).where(eq(capsuleTags.capsuleId, capsuleId));
    if (tagIds.length > 0) {
      await tx.insert(capsuleTags).values([...new Set(tagIds)].map((tagId) => ({ capsuleId, tagId })));
    }
  });
}
