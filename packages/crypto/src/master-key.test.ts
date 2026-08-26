import { describe, expect, it } from 'vitest';
import { generateCapsuleKey, unwrapCapsuleKeyForOwner, wrapCapsuleKeyForOwner } from './capsule-key';
import { generateMasterKey, rewrapMasterKeyWithNewPassword, unwrapMasterKeyWithPassword, wrapMasterKeyWithPassword } from './master-key';
import { generateRecoveryCode, restoreMasterKeyFromRecoveryCode, wrapMasterKeyWithRecoveryCode } from './recovery-kit';

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

  /**
   * E1.1 (plan/STAGE-E-MOBILE-V1-E0.5-RECOVERY-FLOW-SPIKE.md §19, "historical
   * capsule decryption post-recovery"): proves the conceptual invariant the
   * whole forgot-password fix depends on, composing only already-existing,
   * already-tested primitives — no new crypto. A capsule key wrapped under
   * the master key *before* any recovery ever happens ("old ciphertext")
   * must still unwrap correctly under the *same* master key once it's been
   * recovered via the recovery code and re-wrapped under a brand-new
   * password — proving recovery never silently produces a different key.
   */
  it('a capsule key wrapped before recovery still unwraps after recovery-code restoration + password re-wrap', async () => {
    const masterKey = generateMasterKey();
    const capsuleKey = generateCapsuleKey();
    const oldCapsuleKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);

    const recoveryCode = generateRecoveryCode();
    const recoveryKeyWrap = await wrapMasterKeyWithRecoveryCode(masterKey, recoveryCode);

    // Simulates the forgot-password flow: password is gone, only the
    // recovery code is used to get the master key back, then it's re-wrapped
    // under a freshly chosen password — exactly what the API's
    // resetPassword(token, newPassword, masterKeyWrap) now persists.
    const restoredMasterKey = await restoreMasterKeyFromRecoveryCode(recoveryKeyWrap, recoveryCode);
    const newMasterKeyWrap = await wrapMasterKeyWithPassword(restoredMasterKey, 'brand-new-password-after-recovery');
    const masterKeyAfterRecovery = await unwrapMasterKeyWithPassword(newMasterKeyWrap, 'brand-new-password-after-recovery');

    expect(masterKeyAfterRecovery).toEqual(masterKey);
    const recoveredCapsuleKey = await unwrapCapsuleKeyForOwner(oldCapsuleKeyWrap, masterKeyAfterRecovery);
    expect(recoveredCapsuleKey).toEqual(capsuleKey);
  });
});
