import type { Block } from '@tc/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { blocks } from '../../db/schema/index.js';

type BlockRow = typeof blocks.$inferSelect;

function toBlock(row: BlockRow): Block {
  return { blockedEmail: row.blockedEmail, createdAt: row.createdAt.toISOString() };
}

export async function listBlocks(db: Database, userId: string): Promise<Block[]> {
  const rows = await db.select().from(blocks).where(eq(blocks.blockerUserId, userId));
  return rows.map(toBlock);
}

/** Upsert-like: blocking the same email twice is a harmless no-op (composite PK on blockerUserId+blockedEmail). */
export async function createBlock(db: Database, userId: string, email: string): Promise<Block> {
  const [existing] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.blockerUserId, userId), eq(blocks.blockedEmail, email)))
    .limit(1);
  if (existing) {
    return toBlock(existing);
  }

  const [row] = (await db.insert(blocks).values({ blockerUserId: userId, blockedEmail: email }).returning()) as [BlockRow];
  return toBlock(row);
}

export async function deleteBlock(db: Database, userId: string, email: string): Promise<void> {
  await db.delete(blocks).where(and(eq(blocks.blockerUserId, userId), eq(blocks.blockedEmail, email)));
}
