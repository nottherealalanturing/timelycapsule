/**
 * Cursor pagination per plan/03-ARCHITECTURE.md §14 (`?cursor=&limit=` →
 * `{ data, nextCursor }`). Opaque cursor = base64 of the last row's sort
 * key (id or timestamp) — callers never construct these by hand.
 */

export function encodeCursor(value: string | number): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor(cursor: string): string | number {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Given rows fetched with `limit + 1`, splits off the lookahead row and
 * derives `nextCursor` from the last kept row's sort key.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  cursorKey: (row: T) => string | number,
): PageResult<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last !== undefined ? encodeCursor(cursorKey(last)) : null;
  return { data, nextCursor };
}
