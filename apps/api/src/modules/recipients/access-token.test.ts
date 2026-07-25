import { describe, expect, it } from 'vitest';
import { generateAccessToken, hashAccessToken } from './access-token.js';

describe('recipient access token', () => {
  it('generates a 26-char uppercase base32 token', () => {
    const token = generateAccessToken();
    expect(token).toHaveLength(26);
    expect(token).toMatch(/^[A-Z2-7]{26}$/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateAccessToken()));
    expect(tokens.size).toBe(1000);
  });

  it('hashes deterministically', () => {
    const token = generateAccessToken();
    expect(hashAccessToken(token)).toBe(hashAccessToken(token));
  });

  it('produces different hashes for different tokens', () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(hashAccessToken(a)).not.toBe(hashAccessToken(b));
  });
});
