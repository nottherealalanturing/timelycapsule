import type { Capsule } from '@tc/contracts';

/**
 * Which of the record's non-crypto states an owned capsule is in, before
 * any decryption is attempted — mirrors
 * apps/web/src/components/capsule/LetterRecord.tsx's exact gating order
 * (Destroyed → Withheld → the "Open" query's own `!contentDocEnc ||
 * !ownerKeyWrap` no-op check), reproduced here as a pure, synchronous
 * function so it's testable without any async/crypto involved and so the
 * screen can decide *whether* to call `decryptCapsuleContent` at all
 * before calling it — this function never touches the master key.
 *
 * `no_content` covers both a `draft` that hasn't been through its first
 * autosave yet (`contentDocEnc`/`ownerKeyWrap` both `null` — the fifth
 * reachable state the E1.3 final readiness audit added) and the
 * structurally-equivalent case of only one of the two being `null`; either
 * way there is nothing to unwrap or decrypt, so `needs_decrypt` is never
 * returned for it.
 */
export type CapsuleRecordState = 'destroyed' | 'withheld' | 'no_content' | 'needs_decrypt';

export function classifyCapsuleRecord(
  capsule: Pick<Capsule, 'type' | 'state' | 'expiryStrict' | 'contentDocEnc' | 'ownerKeyWrap'>,
): CapsuleRecordState {
  if (capsule.expiryStrict && capsule.state === 'expired') return 'destroyed';
  if (capsule.type === 'self' && capsule.state === 'sealed') return 'withheld';
  if (!capsule.contentDocEnc || !capsule.ownerKeyWrap) return 'no_content';
  return 'needs_decrypt';
}
