'use client';

import type { CapsuleListItem } from '@tc/contracts';
import { DualClock, Hallmark, StateChip, cn } from '@tc/ui-web';
import Link from 'next/link';
import { useCorrectedNow } from '../lib/use-corrected-now';

/**
 * Resolves a capsule's unlock instant regardless of unlockMode — recipient_local
 * capsules don't have a single instant until a recipient's tz is known, so this
 * falls back to interpreting unlockLocal in the *browser's* tz as a best-effort
 * owner-side estimate.
 *
 * Unchanged from V1. This is business logic, not presentation.
 */
export function resolveUnlockDate(
  capsule: Pick<CapsuleListItem, 'unlockMode' | 'unlockAt' | 'unlockLocal'>,
): Date | null {
  if (capsule.unlockMode === 'recipient_local') {
    if (!capsule.unlockLocal) return null;
    return new Date(`${capsule.unlockLocal.date}T${capsule.unlockLocal.time}:00`);
  }
  return capsule.unlockAt ? new Date(capsule.unlockAt) : null;
}

/** Non-sealed states have no wait to describe, so they state themselves plainly. */
const RESTING_LABEL: Partial<Record<CapsuleListItem['state'], string>> = {
  draft: 'Not yet sealed',
  sealing: 'Sealing',
  unlocked: 'Opened',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

/**
 * A capsule at rest in the archive.
 *
 * Meridian V2 rebuild. Two substantive changes beyond tokens:
 *
 * 1. **The Dual Clock replaces the countdown.** V1 showed *"Unlocks in 12
 *    years"* — remaining only. `03 §V.1` requires elapsed to be shown as
 *    prominently as remaining: remaining is a deadline and produces impatience,
 *    elapsed is a distance travelled and produces meaning. `sealedAt` was
 *    already on `CapsuleListItem`, so this needed no contract change.
 * 2. **The cover band is gone.** A decorative gradient strip is exactly the
 *    "decoration that serves none of the five signature devices" that `07 §III`
 *    says to cut. The card's job is to make a wait legible, and the band was
 *    taking a third of its height to do nothing.
 *
 * The archive must read as a shelf, not a queue (`09 §XII`) — hence resting
 * states are stated flatly rather than styled as pending work.
 */
export function CapsuleCard({ capsule, className }: { capsule: CapsuleListItem; className?: string }) {
  const unlockDate = resolveUnlockDate(capsule);
  const isWaiting = capsule.state === 'sealed' && unlockDate !== null;
  const nowMs = useCorrectedNow(isWaiting ? unlockDate : null);

  const sealedMs = capsule.sealedAt ? new Date(capsule.sealedAt).getTime() : null;
  const showClock = isWaiting && nowMs !== null && sealedMs !== null;

  return (
    <Link
      href={`/capsule/${capsule.id}`}
      className={cn(
        'motion-instant group flex flex-col gap-3 rounded-[var(--radius-card)] p-4',
        'border border-[var(--color-rule)] bg-[var(--color-bg-raised)]',
        'hover:border-[var(--color-rule-strong)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Hallmark>{capsule.publicId}</Hallmark>
        {capsule.isFavorite ? (
          <span aria-label="Favourite" className="text-[length:var(--text-caption)] text-secondary">
            ★
          </span>
        ) : null}
      </div>

      <h3 className="line-clamp-2 text-[length:var(--text-title-s)] leading-[var(--lh-heading)]">
        {capsule.title || 'Untitled capsule'}
      </h3>

      <div className="mt-auto flex flex-col gap-3 border-t border-[var(--color-rule)] pt-3">
        {showClock ? (
          <DualClock
            size="sm"
            elapsedMs={nowMs - sealedMs}
            remainingMs={unlockDate.getTime() - nowMs}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            <Hallmark>Status</Hallmark>
            <span className="text-[length:var(--text-body-s)] text-secondary">
              {RESTING_LABEL[capsule.state] ?? capsule.state}
            </span>
          </div>
        )}
        <StateChip state={capsule.state} className="self-start" />
      </div>
    </Link>
  );
}
