import type { CapsuleType, Seal } from '@tc/contracts';
import { ApiError } from '../../lib/errors.js';
import type { PlanLimits } from './entitlements.js';

/**
 * Validates the `seals` array beyond what Zod's shape-checking already
 * covers (plan/03-ARCHITECTURE.md §8 "Seals"): at most one of each type,
 * Legacy capsules restricted to Identity only, and the free-plan limit on
 * stacking Place+Passphrase together. Time itself is never in this array —
 * it's always present via the capsule's own `unlockAt`.
 */
export function validateSeals(seals: Seal[], type: CapsuleType, limits: PlanLimits): void {
  const seenTypes = new Set<string>();
  for (const seal of seals) {
    if (seenTypes.has(seal.type)) {
      throw ApiError.validationFailed({ seals: `Duplicate seal type: ${seal.type}` });
    }
    seenTypes.add(seal.type);
  }

  if (type === 'legacy' && seals.some((s) => s.type !== 'identity')) {
    throw ApiError.validationFailed({ seals: 'Legacy capsules only support the Identity seal' });
  }

  if (limits.placeOrPassphraseSealsPerCapsule !== null) {
    const stackedCount = seals.filter((s) => s.type === 'place' || s.type === 'passphrase').length;
    if (stackedCount > limits.placeOrPassphraseSealsPerCapsule) {
      throw ApiError.quotaExceeded(`place_or_passphrase_seals:${limits.placeOrPassphraseSealsPerCapsule}`);
    }
  }
}

/** The dedicated `passphraseHint` column is a denormalized copy for display without parsing jsonb — kept in sync here. */
export function extractPassphraseHint(seals: Seal[]): string | null {
  const passphraseSeal = seals.find((s) => s.type === 'passphrase');
  return passphraseSeal?.config.hint ?? null;
}
