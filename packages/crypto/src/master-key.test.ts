import { describe, expect, it } from 'vitest';
import { generateMasterKey, rewrapMasterKeyWithNewPassword, unwrapMasterKeyWithPassword, wrapMasterKeyWithPassword } from './master-key.js';

describe('master key wrap/unwrap', () => {
  it('round-trips with the correct password', async () => {
    const masterKey = generateMasterKey();
    const wrapped = await wrapMasterKeyWithPassword(masterKey, 'correct-horse-battery-staple');
    const unwrapped = await unwrapMasterKeyWithPassword(wrapped, 'correct-horse-battery-staple');
    expect(unwrapped).toEqual(masterKey);
  });

  it('rejects the wrong password', async () => {
    const masterKey = generateMasterKey();
    const wrapped = await wrapMasterKeyWithPassword(masterKey, 'correct-horse-battery-staple');
    await expect(unwrapMasterKeyWithPassword(wrapped, 'wrong-password')).rejects.toThrow();
  });

  it('re-wraps under a new password without changing the master key', async () => {
    const masterKey = generateMasterKey();
    const rewrapped = await rewrapMasterKeyWithNewPassword(masterKey, 'brand-new-password');
    const unwrapped = await unwrapMasterKeyWithPassword(rewrapped, 'brand-new-password');
    expect(unwrapped).toEqual(masterKey);
  });
});
