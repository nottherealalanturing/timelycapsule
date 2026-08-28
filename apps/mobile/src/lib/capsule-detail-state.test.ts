import type { Capsule } from '@tc/contracts';
import { describe, expect, it } from 'vitest';
import { classifyCapsuleRecord } from './capsule-detail-state';

function fixture(overrides: Partial<Pick<Capsule, 'type' | 'state' | 'expiryStrict' | 'contentDocEnc' | 'ownerKeyWrap'>> = {}) {
  return {
    type: 'personal' as const,
    state: 'unlocked' as const,
    expiryStrict: false,
    contentDocEnc: 'ciphertext',
    ownerKeyWrap: 'wrap',
    ...overrides,
  };
}

describe('classifyCapsuleRecord', () => {
  it('classifies an expiryStrict, expired capsule as destroyed', () => {
    expect(classifyCapsuleRecord(fixture({ expiryStrict: true, state: 'expired' }))).toBe('destroyed');
  });

  it('does not classify an expired capsule as destroyed when expiryStrict is false', () => {
    expect(classifyCapsuleRecord(fixture({ expiryStrict: false, state: 'expired' }))).not.toBe('destroyed');
  });

  it('classifies a sealed self-capsule as withheld', () => {
    expect(classifyCapsuleRecord(fixture({ type: 'self', state: 'sealed' }))).toBe('withheld');
  });

  it('does not classify a sealed non-self capsule as withheld', () => {
    expect(classifyCapsuleRecord(fixture({ type: 'personal', state: 'sealed' }))).not.toBe('withheld');
  });

  it('does not classify an unlocked self-capsule as withheld (only sealed is withheld)', () => {
    expect(classifyCapsuleRecord(fixture({ type: 'self', state: 'unlocked' }))).not.toBe('withheld');
  });

  it('classifies a draft with both contentDocEnc and ownerKeyWrap null as no_content, without needing decryption', () => {
    expect(classifyCapsuleRecord(fixture({ state: 'draft', contentDocEnc: null, ownerKeyWrap: null }))).toBe('no_content');
  });

  it('classifies a capsule with only contentDocEnc null as no_content', () => {
    expect(classifyCapsuleRecord(fixture({ contentDocEnc: null, ownerKeyWrap: 'wrap' }))).toBe('no_content');
  });

  it('classifies a capsule with only ownerKeyWrap null as no_content', () => {
    expect(classifyCapsuleRecord(fixture({ contentDocEnc: 'ciphertext', ownerKeyWrap: null }))).toBe('no_content');
  });

  it('classifies a normal unlocked capsule with real content as needs_decrypt', () => {
    expect(classifyCapsuleRecord(fixture({ state: 'unlocked' }))).toBe('needs_decrypt');
  });

  it('checks destroyed before withheld: an expiryStrict-expired self-capsule is destroyed, not withheld', () => {
    expect(classifyCapsuleRecord(fixture({ type: 'self', state: 'expired', expiryStrict: true }))).toBe('destroyed');
  });
});
