import type { Tag } from '@tc/contracts';
import type { tags } from '../../db/schema/index.js';

type TagRow = typeof tags.$inferSelect;

export function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}
