import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { favorites } from '../../db/schema/index.js';
import { findOwnedCapsuleOrThrow } from '../capsules/index.js';

export async function setFavorite(db: Database, ownerId: string, capsuleId: string, value: boolean): Promise<void> {
  await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);

  if (value) {
    await db.insert(favorites).values({ userId: ownerId, capsuleId }).onConflictDoNothing();
  } else {
    await db.delete(favorites).where(and(eq(favorites.userId, ownerId), eq(favorites.capsuleId, capsuleId)));
  }
}
