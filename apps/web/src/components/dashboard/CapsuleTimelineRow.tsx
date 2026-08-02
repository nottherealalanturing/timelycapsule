'use client';

import type { CapsuleListItem } from '@tc/contracts';
import { DualClock, Hallmark, StateChip } from '@tc/ui-web';
import Link from 'next/link';
import { useCorrectedNow } from '../../lib/use-corrected-now';
import { resolveUnlockDate } from '../CapsuleCard';

/**
 * One capsule as a timeline row.
 *
 * Two changes from V1 beyond tokens:
 *
 * 1. **The Dual Clock replaces the remaining-only countdown**, matching the
 *    card (`03 §V.1`). A row is the densest place the clock appears, so it
 *    runs at `sm` and the emphasis logic does the rest.
 * 2. **It is a link, not a button.** V1 used `<button onClick={router.push}>`,
 *    which cannot be opened in a new tab, has no href for the browser to show,
 *    and is announced as a button rather than a destination. Navigation should
 *    be a link; this is an accessibility correction, not a restyle.
 */
export function CapsuleTimelineRow({ capsule }: { capsule: CapsuleListItem }) {
  const unlockDate = resolveUnlockDate(capsule);
  const isWaiting = capsule.state === 'sealed' && unlockDate !== null;
  const nowMs = useCorrectedNow(isWaiting ? unlockDate : null);
  const sealedMs = capsule.sealedAt ? new Date(capsule.sealedAt).getTime() : null;
  const showClock = isWaiting && nowMs !== null && sealedMs !== null;

  return (
    <Link
      href={`/capsule/${capsule.id}`}
      className="motion-instant flex items-center justify-between gap-4 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-4 py-3 hover:border-[var(--color-rule-strong)]"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <Hallmark>{capsule.publicId}</Hallmark>
        <span className="truncate text-[length:var(--text-body)] text-foreground">
          {capsule.title || 'Untitled capsule'}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-5">
        {showClock ? (
          <DualClock
            size="sm"
            elapsedMs={nowMs - sealedMs}
            remainingMs={unlockDate.getTime() - nowMs}
          />
        ) : null}
        <StateChip state={capsule.state} />
      </span>
    </Link>
  );
}
