import { describe, expect, it } from 'vitest';
import { deriveKeyFromPassword, deriveKeyFromRecoveryCode } from './kdf';
import { generateRecoveryCodeBytes, generateSalt } from './random';

describe('deriveKeyFromPassword', () => {
  it('is deterministic for the same password+salt', async () => {
    const salt = generateSalt();
    const a = await deriveKeyFromPassword('correct-horse', salt);
    const b = await deriveKeyFromPassword('correct-horse', salt);
    expect(a).toEqual(b);
  });

  it('differs for a different password', async () => {
    const salt = generateSalt();
    const a = await deriveKeyFromPassword('correct-horse', salt);
    const b = await deriveKeyFromPassword('wrong-horse', salt);
    expect(a).not.toEqual(b);
  });
});

describe('deriveKeyFromRecoveryCode', () => {
  it('is deterministic for the same code+salt', async () => {
    const code = generateRecoveryCodeBytes();
    const salt = generateSalt();
    const a = await deriveKeyFromRecoveryCode(code, salt);
    const b = await deriveKeyFromRecoveryCode(code, salt);
    expect(a).toEqual(b);
  });
});
