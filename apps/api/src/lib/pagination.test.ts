import { describe, expect, it } from 'vitest';
import { buildPage, decodeCursor, encodeCursor } from './pagination.js';

describe('cursor encode/decode', () => {
  it('round-trips a string id', () => {
    expect(decodeCursor(encodeCursor('abc-123'))).toBe('abc-123');
  });

  it('round-trips a numeric value', () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
  });
});

describe('buildPage', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns all rows and a null cursor when under the limit', () => {
    const page = buildPage(rows, 5, (r) => r.id);
    expect(page.data).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('trims the lookahead row and derives nextCursor from the last kept row', () => {
    const page = buildPage(rows, 2, (r) => r.id);
    expect(page.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(page.nextCursor).toBe(encodeCursor('b'));
  });
});
