import { describe, expect, it } from 'vitest';
import { generateMasterKey } from './master-key.js';
import {
  formatRecoveryCode,
  generateRecoveryCode,
  parseRecoveryCode,
  restoreMasterKeyFromRecoveryCode,
  wrapMasterKeyWithRecoveryCode,
} from './recovery-kit.js';

describe('recovery kit', () => {
  it('restores the master key from the recovery code', async () => {
    const masterKey = generateMasterKey();
    const code = generateRecoveryCode();
    const wrapped = await wrapMasterKeyWithRecoveryCode(masterKey, code);
    const restored = await restoreMasterKeyFromRecoveryCode(wrapped, code);
    expect(restored).toEqual(masterKey);
  });

  it('rejects a wrong recovery code', async () => {
    const masterKey = generateMasterKey();
    const code = generateRecoveryCode();
    const wrongCode = generateRecoveryCode();
    const wrapped = await wrapMasterKeyWithRecoveryCode(masterKey, code);
    await expect(restoreMasterKeyFromRecoveryCode(wrapped, wrongCode)).rejects.toThrow();
  });

  it('formats and re-parses a recovery code losslessly', () => {
    const code = generateRecoveryCode();
    const formatted = formatRecoveryCode(code);
    expect(formatted).toMatch(/^[0-9A-Z-]+$/);
    expect(parseRecoveryCode(formatted)).toEqual(code);
  });

  it('parses a recovery code typed with lowercase and stray spaces', () => {
    const code = generateRecoveryCode();
    const formatted = formatRecoveryCode(code);
    const messy = formatted.toLowerCase().replace(/-/g, ' ');
    expect(parseRecoveryCode(messy)).toEqual(code);
  });
});
