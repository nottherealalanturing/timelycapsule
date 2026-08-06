'use client';

import type { CapsuleListItem } from '@tc/contracts';
import { DualClock, Hallmark, cn } from '@tc/ui-web';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCorrectedNow } from '../../lib/use-corrected-now';
import { resolveUnlockDate } from '../../lib/waiting';

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
 * **A capsule, anywhere in the authenticated app.**
 *
 * There used to be three of these: `CapsuleCard` in a grid, `CapsuleTimelineRow`
 * in a list, and a bespoke row inside Trash — each with its own layout, its own
 * fallback title and its own idea of what to show. Home rendered two of them at
 * once, so the same capsule appeared twice on one screen with the same reading.
 * A capsule is one object; it now has one representation, and a screenshot of
 * any authenticated screen shows the same thing.
 *
 * What it states, in this order: the public id, what it is called, and the
 * reading. Nothing else. In particular there is **no `StateChip`** where the
 * Dual Clock is present — the clock only ever appears on a capsule that is
 * sealed and waiting, so a chip beside it saying "Sealed" is the same fact
 * twice, in a fully-round pill `04 §7` reserves for avatars, dials and the
 * transit marker. States without a wait say so in words instead.
 *
 * Stacks below `sm`. The row previously kept the title and the clock on one
 * line at every width, and on a phone they overlapped.
 */
export function CapsuleRow({ capsule, trailing, className }: CapsuleRowProps) {
  const unlockDate = resolveUnlockDate(capsule);
  const isWaiting = capsule.state === 'sealed' && unlockDate !== null;
  const nowMs = useCorrectedNow(isWaiting ? unlockDate : null);
  const sealedMs = capsule.sealedAt ? new Date(capsule.sealedAt).getTime() : null;
  const showClock = isWaiting && nowMs !== null && sealedMs !== null;

  const name = capsuleName(capsule);

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3', className)}>
      <Link
        href={`/capsule/${capsule.id}`}
        // `basis` keeps the capsule itself dominant: with only `flex-1` a wide
        // `trailing` (Trash's purge line and its two buttons) squeezed the row
        // to ~150px and truncated the name to "For someone e…". Below that
        // basis the trailing group wraps to its own line instead of stealing
        // the width the object needs.
        className={cn(
          'motion-instant group flex min-w-0 flex-1 basis-[22rem] flex-col gap-3 rounded-[var(--radius-input)] px-4 py-3',
          'border border-[var(--color-rule)] hover:border-[var(--color-rule-strong)]',
          'sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        )}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <Hallmark>{capsule.publicId}</Hallmark>
            {capsule.isFavorite ? (
              <span aria-label="Favourite" className="text-[length:var(--text-caption)] text-secondary">
                ★
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              'truncate text-[length:var(--text-body)]',
              name.named ? 'text-foreground' : 'text-secondary',
            )}
          >
            {name.label}
          </span>
        </span>

        <span className="shrink-0">
          {showClock ? (
            <DualClock size="sm" elapsedMs={nowMs - sealedMs} remainingMs={unlockDate.getTime() - nowMs} />
          ) : (
            <span className="flex flex-col gap-0.5">
              <Hallmark>Status</Hallmark>
              <span className="text-[length:var(--text-body-s)] text-secondary">
                {RESTING_LABEL[capsule.state] ?? capsule.state}
              </span>
            </span>
          )}
        </span>
      </Link>

      {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}
