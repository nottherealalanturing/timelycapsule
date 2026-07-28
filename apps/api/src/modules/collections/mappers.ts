import type { Collection } from '@tc/contracts';
import type { collections } from '../../db/schema/index.js';

type CollectionRow = typeof collections.$inferSelect;

export function toCollection(row: CollectionRow, capsuleCount: number): Collection {
  return {
    id: row.id,
    name: row.name,
    cover: row.cover as Collection['cover'],
    position: row.position,
    capsuleCount,
    createdAt: row.createdAt.toISOString(),
  };
}
