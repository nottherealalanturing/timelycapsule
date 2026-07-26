import { describe, expect, it } from 'vitest';
import {
  decodeCapsuleKeyFromLink,
  encodeCapsuleKeyForLink,
  generateCapsuleKey,
  unwrapCapsuleKeyForOwner,
  unwrapCapsuleKeyWithPassphrase,
  wrapCapsuleKeyForOwner,
  wrapCapsuleKeyWithPassphrase,
} from './capsule-key';
import { generateMasterKey } from './master-key';

describe('capsule key — owner wrap', () => {
  it('round-trips under the owner master key', async () => {
    const capsuleKey = generateCapsuleKey();
    const masterKey = generateMasterKey();
    const wrapped = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
    const unwrapped = await unwrapCapsuleKeyForOwner(wrapped, masterKey);
    expect(unwrapped).toEqual(capsuleKey);
  });

  it('rejects the wrong master key', async () => {
    const capsuleKey = generateCapsuleKey();
    const masterKey = generateMasterKey();
    const wrongMasterKey = generateMasterKey();
    const wrapped = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
    await expect(unwrapCapsuleKeyForOwner(wrapped, wrongMasterKey)).rejects.toThrow();
  });
});

describe('capsule key — passphrase seal', () => {
  it('round-trips with the correct passphrase', async () => {
    const capsuleKey = generateCapsuleKey();
    const wrapped = await wrapCapsuleKeyWithPassphrase(capsuleKey, 'our-anniversary-1999');
    const unwrapped = await unwrapCapsuleKeyWithPassphrase(wrapped, 'our-anniversary-1999');
    expect(unwrapped).toEqual(capsuleKey);
  });

  it('rejects the wrong passphrase', async () => {
    const capsuleKey = generateCapsuleKey();
    const wrapped = await wrapCapsuleKeyWithPassphrase(capsuleKey, 'our-anniversary-1999');
    await expect(unwrapCapsuleKeyWithPassphrase(wrapped, 'wrong-guess')).rejects.toThrow();
  });
});

describe('capsule key — recipient link fragment', () => {
  it('round-trips through the #k= fragment format', () => {
    const capsuleKey = generateCapsuleKey();
    const fragment = `#${encodeCapsuleKeyForLink(capsuleKey)}`;
    expect(decodeCapsuleKeyFromLink(fragment)).toEqual(capsuleKey);
  });

  it('throws when the fragment has no key', () => {
    expect(() => decodeCapsuleKeyFromLink('#other=value')).toThrow();
  });
});
