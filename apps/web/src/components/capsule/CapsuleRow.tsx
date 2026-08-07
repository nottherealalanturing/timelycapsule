'use client';

import type { CapsuleListItem } from '@tc/contracts';
import { DualClock } from '@tc/ui-web';
import type { ReactNode } from 'react';
import { useCorrectedNow } from '../../lib/use-corrected-now';
import { resolveUnlockDate } from '../../lib/waiting';
import { CapsuleObject, StatedReading } from './CapsuleObject';

/**
 * What a capsule is called, when it has not been called anything.
 *
 * The title is optional by design — `design/21 §II` removed it from the
 * writing flow entirely and made it a note for the sender, "for finding it
 * again". An untitled capsule is therefore the *normal* case, not an omission,
 * and labelling it `Untitled capsule` in the same weight as a real name made
 * the commonest capsule in the product look like a bug and quietly pressed
 * people to name things they had decided not to name.
 *
 * So an unnamed capsule is identified by what it *is*, in the words Address
 * uses to ask: for yourself, or for someone else. Rendered as description
 * rather than as a name, which is the honest distinction and needs no
 * placeholder noun.
 */
export function capsuleName(capsule: Pick<CapsuleListItem, 'title' | 'type'>): {
  label: string;
  named: boolean;
} {
  if (capsule.title) return { label: capsule.title, named: true };
  return { label: capsule.type === 'self' ? 'For yourself' : 'For someone else', named: false };
}

/** Non-waiting states have no wait to describe, so they state themselves plainly. */
const RESTING_LABEL: Partial<Record<CapsuleListItem['state'], string>> = {
  draft: 'Not yet sealed',
  sealing: 'Sealing',
  unlocked: 'Opened',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

export interface CapsuleRowProps {
  capsule: CapsuleListItem;
  /** Context actions — reorder in a collection, restore from trash. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * **A capsule the owner is looking after.**
 *
 * There used to be three of these: `CapsuleCard` in a grid,
 * `CapsuleTimelineRow` in a list, and a bespoke row inside Trash. A capsule is
 * one object; it has one representation, drawn by `CapsuleObject`, which
 * Received now shares.
 *
 * In particular there is **no `StateChip`** where the Dual Clock is present —
 * the clock only ever appears on a capsule that is sealed and waiting, so a
 * chip beside it saying "Sealed" is the same fact twice.
 */
export function CapsuleRow({ capsule, trailing, className }: CapsuleRowProps) {
  const unlockDate = resolveUnlockDate(capsule);
  const isWaiting = capsule.state === 'sealed' && unlockDate !== null;
  const nowMs = useCorrectedNow(isWaiting ? unlockDate : null);
  const sealedMs = capsule.sealedAt ? new Date(capsule.sealedAt).getTime() : null;
  const showClock = isWaiting && nowMs !== null && sealedMs !== null;

  return (
    <CapsuleObject
      publicId={capsule.publicId}
      name={capsuleName(capsule)}
      favourite={capsule.isFavorite}
      href={`/capsule/${capsule.id}`}
      trailing={trailing}
      className={className}
      reading={
        showClock ? (
          <DualClock size="sm" elapsedMs={nowMs - sealedMs} remainingMs={unlockDate.getTime() - nowMs} />
        ) : (
          <StatedReading label="Status" value={RESTING_LABEL[capsule.state] ?? capsule.state} />
        )
      }
    />
  );
}
