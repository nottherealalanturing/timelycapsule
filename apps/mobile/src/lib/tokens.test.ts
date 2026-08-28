import { CapsuleStateSchema } from '@tc/contracts';
import { describe, expect, it } from 'vitest';
import { capsuleStateColors, colors } from './tokens';

describe('tokens.ts — capsuleStateColors', () => {
  it('covers exactly the states CapsuleStateSchema defines — none invented, none missing', () => {
    const schemaStates = [...CapsuleStateSchema.options].sort();
    const mappedStates = Object.keys(capsuleStateColors).sort();
    expect(mappedStates).toEqual(schemaStates);
  });

  it('reserves brass for "sealed" and nowhere else', () => {
    const entries = Object.entries(capsuleStateColors);
    const brassEntries = entries.filter(([, color]) => color === colors.brass);
    expect(brassEntries).toEqual([['sealed', colors.brass]]);
  });

  it('every state maps to a non-empty color value', () => {
    for (const color of Object.values(capsuleStateColors)) {
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
    }
  });
});
