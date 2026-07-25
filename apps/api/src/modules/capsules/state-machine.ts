import { ApiError } from '../../lib/errors.js';
import type { capsules } from '../../db/schema/index.js';

type CapsuleRow = typeof capsules.$inferSelect;

const MIN_UNLOCK_LEAD_MS = 5 * 60 * 1000;
const MAX_UNLOCK_HORIZON_MS = 50 * 365.25 * 24 * 60 * 60 * 1000; // 50 years
const MAX_EXTEND_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * State machine invariants — plan/03-ARCHITECTURE.md §8. `trashedAt` and
 * `archivedAt` are side-flags on top of `state`, not distinct enum values
 * (the diagram's "draft → trashed" arrow is shorthand for setting the
 * flag; `capsuleStateEnum` itself has no `trashed` member) — so trash and
 * archive never touch `state`, only withdraw/seal do.
 */

// --- Invariant 2: unlock_at bounds ---

export function assertUnlockAtWithinBounds(unlockAt: Date, now: Date = new Date()): void {
  const leadMs = unlockAt.getTime() - now.getTime();
  if (leadMs < MIN_UNLOCK_LEAD_MS) {
    throw ApiError.unlockInPast('unlockAt must be at least 5 minutes from now');
  }
  if (leadMs > MAX_UNLOCK_HORIZON_MS) {
    throw ApiError.unlockInPast('unlockAt must be no more than 50 years from now');
  }
}

// --- Invariant 1: PATCH only allowed pre-seal ---

export function assertCanPatch(capsule: CapsuleRow): void {
  if (capsule.state !== 'draft') {
    throw ApiError.capsuleSealed();
  }
}

export function assertCanSeal(capsule: CapsuleRow): void {
  if (capsule.state !== 'draft') {
    throw ApiError.capsuleSealed('Only a draft can be sealed');
  }
}

// --- Withdraw: pre-unlock only, never if any recipient has opened ---

export function assertCanWithdraw(capsule: CapsuleRow, anyRecipientOpened: boolean): void {
  if (capsule.state === 'withdrawn') {
    throw ApiError.capsuleWithdrawn('Capsule is already withdrawn');
  }
  if (capsule.state !== 'sealed') {
    throw ApiError.capsuleSealed('Only a sealed (pre-unlock) capsule can be withdrawn');
  }
  if (anyRecipientOpened) {
    throw ApiError.forbidden('Cannot withdraw — at least one recipient has already opened this capsule');
  }
}

// --- Extend: once, ≤30 days, pre-unlock ---

export function assertCanExtend(capsule: CapsuleRow): void {
  if (capsule.state !== 'sealed') {
    throw ApiError.capsuleSealed('Only a sealed (pre-unlock) capsule can be extended');
  }
  if (capsule.extendedOnce) {
    throw ApiError.forbidden('Capsule has already been extended once');
  }
}

export function assertExtendWithinBounds(currentUnlockAt: Date, newUnlockAt: Date, now: Date = new Date()): void {
  if (newUnlockAt.getTime() <= currentUnlockAt.getTime()) {
    throw ApiError.unlockInPast('newUnlockAt must be later than the current unlock time');
  }
  if (newUnlockAt.getTime() - currentUnlockAt.getTime() > MAX_EXTEND_MS) {
    throw ApiError.forbidden('Cannot extend by more than 30 days');
  }
  assertUnlockAtWithinBounds(newUnlockAt, now);
}

// --- Trash: forbidden once opened, or (sealed + third-party recipients), or (legacy/emergency with active config) ---

export function assertCanTrash(
  capsule: CapsuleRow,
  context: { anyRecipientOpened: boolean; hasThirdPartyRecipients: boolean },
): void {
  if (capsule.trashedAt) {
    throw ApiError.forbidden('Capsule is already trashed');
  }
  if (context.anyRecipientOpened) {
    throw ApiError.forbidden('Cannot trash — at least one recipient has already opened this capsule');
  }
  if (capsule.state === 'sealed' && context.hasThirdPartyRecipients) {
    throw ApiError.forbidden('Sealed capsules with recipients must be withdrawn before they can be trashed');
  }
  if ((capsule.type === 'legacy' || capsule.type === 'emergency') && capsule.legacyConfig) {
    throw ApiError.forbidden('Disable legacy/emergency delivery configuration before trashing this capsule');
  }
}

export function assertCanRestore(capsule: CapsuleRow): void {
  if (!capsule.trashedAt) {
    throw ApiError.forbidden('Capsule is not trashed');
  }
}

// --- Archive: a side-flag on the owner's own view; never blocked by recipient state ---

export function assertCanArchive(capsule: CapsuleRow): void {
  if (capsule.trashedAt) {
    throw ApiError.forbidden('Cannot archive a trashed capsule — restore it first');
  }
  if (capsule.archivedAt) {
    throw ApiError.forbidden('Capsule is already archived');
  }
}

export function assertCanUnarchive(capsule: CapsuleRow): void {
  if (!capsule.archivedAt) {
    throw ApiError.forbidden('Capsule is not archived');
  }
}

export function assertCanDuplicate(capsule: CapsuleRow): void {
  if (capsule.trashedAt) {
    throw ApiError.forbidden('Cannot duplicate a trashed capsule');
  }
}
