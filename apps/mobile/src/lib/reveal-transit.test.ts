import { describe, expect, it, vi } from 'vitest';

// This file's pure functions don't touch AccessibilityInfo directly, but
// reveal-transit.ts imports it at module scope — react-native's real
// package can't be parsed by Vitest's transform (Flow syntax), so it's
// mocked the same way every other test in this app mocks it.
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(async () => false),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

const { deriveTransitFlags, segment, TRANSIT, TRANSIT_REDUCED } = await import('./reveal-transit');

describe('segment()', () => {
  it('is 0 before the segment starts and 1 once it ends', () => {
    expect(segment(0, 100, 200)).toBe(0);
    expect(segment(50, 100, 200)).toBe(0);
    expect(segment(200, 100, 200)).toBe(1);
    expect(segment(500, 100, 200)).toBe(1);
  });

  it('interpolates linearly in between', () => {
    expect(segment(150, 100, 200)).toBeCloseTo(0.5);
    expect(segment(125, 100, 200)).toBeCloseTo(0.25);
  });

  it('a zero-length segment is a step at `to`, never NaN or divide-by-zero', () => {
    expect(segment(0, 100, 100)).toBe(0);
    expect(segment(100, 100, 100)).toBe(1);
  });
});

describe('deriveTransitFlags() — full-motion timeline bucket boundaries', () => {
  it('opened flips exactly at crossEnd, not before', () => {
    expect(deriveTransitFlags(TRANSIT.crossEnd - 1, TRANSIT).opened).toBe(false);
    expect(deriveTransitFlags(TRANSIT.crossEnd, TRANSIT).opened).toBe(true);
  });

  it('emptyFrame is the window [recedeEnd, emptyFrameEnd) and nowhere else', () => {
    expect(deriveTransitFlags(TRANSIT.recedeEnd - 1, TRANSIT).emptyFrame).toBe(false);
    expect(deriveTransitFlags(TRANSIT.recedeEnd, TRANSIT).emptyFrame).toBe(true);
    expect(deriveTransitFlags(TRANSIT.emptyFrameEnd - 1, TRANSIT).emptyFrame).toBe(true);
    expect(deriveTransitFlags(TRANSIT.emptyFrameEnd, TRANSIT).emptyFrame).toBe(false);
  });

  it('done flips exactly at stampEnd', () => {
    expect(deriveTransitFlags(TRANSIT.stampEnd - 1, TRANSIT).done).toBe(false);
    expect(deriveTransitFlags(TRANSIT.stampEnd, TRANSIT).done).toBe(true);
  });
});

describe('deriveTransitFlags() — reduced-motion timeline', () => {
  it('every held beat (silence, empty frame, stillness) is preserved in duration even though the moving segments are compressed', () => {
    // 07-EXPERIENCE-BIBLE.md §VI.4: "all held beats are preserved" under
    // reduced motion — only the segments that move get shorter.
    expect(TRANSIT_REDUCED.silenceEnd - TRANSIT_REDUCED.approachEnd).toBe(TRANSIT.silenceEnd - TRANSIT.approachEnd);
    expect(TRANSIT_REDUCED.emptyFrameEnd - TRANSIT_REDUCED.recedeEnd).toBe(TRANSIT.emptyFrameEnd - TRANSIT.recedeEnd);
    expect(TRANSIT_REDUCED.stillnessEnd - TRANSIT_REDUCED.letterEnd).toBe(TRANSIT.stillnessEnd - TRANSIT.letterEnd);
  });

  it('the reduced timeline is meaningfully shorter overall', () => {
    expect(TRANSIT_REDUCED.stampEnd).toBeLessThan(TRANSIT.stampEnd);
  });

  it('bucket boundaries hold on the reduced timeline the same way they do on the full one', () => {
    expect(deriveTransitFlags(TRANSIT_REDUCED.crossEnd - 1, TRANSIT_REDUCED).opened).toBe(false);
    expect(deriveTransitFlags(TRANSIT_REDUCED.crossEnd, TRANSIT_REDUCED).opened).toBe(true);
    expect(deriveTransitFlags(TRANSIT_REDUCED.stampEnd, TRANSIT_REDUCED).done).toBe(true);
  });
});
