'use client';

import type { CapsuleListItem } from '@tc/contracts';
import { StateChip, cn } from '@tc/ui-web';
import Link from 'next/link';
import { CountdownDisplay } from './CountdownDisplay';

/** Resolves a capsule's unlock instant regardless of unlockMode — recipient_local capsules don't have a single instant until a recipient's tz is known, so this falls back to interpreting unlockLocal in the *browser's* tz as a best-effort owner-side estimate. */
export function resolveUnlockDate(capsule: Pick<CapsuleListItem, 'unlockMode' | 'unlockAt' | 'unlockLocal'>): Date | null {
  if (capsule.unlockMode === 'recipient_local') {
    if (!capsule.unlockLocal) return null;
    return new Date(`${capsule.unlockLocal.date}T${capsule.unlockLocal.time}:00`);
  }
  return capsule.unlockAt ? new Date(capsule.unlockAt) : null;
}

function coverStyle(cover: CapsuleListItem['cover']): React.CSSProperties {
  if (cover?.kind === 'gradient') return { background: cover.value };
  return { background: 'var(--color-bg-raised)' };
}

export function CapsuleCard({ capsule, className }: { capsule: CapsuleListItem; className?: string }) {
  const unlockDate = resolveUnlockDate(capsule);

  return (
    <Link
      href={`/capsule/${capsule.id}`}
      className={cn(
        'flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 transition hover:shadow-md',
        className,
      )}
    >
      <div className="h-24 shrink-0" style={coverStyle(capsule.cover)} />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <StateChip state={capsule.state} />
          {capsule.isFavorite ? (
            <span aria-label="Favorite" className="text-[var(--color-accent-gold)]">
              ★
            </span>
          ) : null}
        </div>
        <h3 className="truncate font-[var(--font-display)] text-base text-foreground">{capsule.title || 'Untitled capsule'}</h3>
        {capsule.state === 'sealed' && unlockDate ? (
          <p className="text-sm text-secondary">
            Unlocks in <CountdownDisplay target={unlockDate} className="font-medium text-foreground" />
          </p>
        ) : capsule.state === 'unlocked' ? (
          <p className="text-sm font-medium text-[var(--color-state-unlocked)]">Unlocked</p>
        ) : capsule.state === 'draft' ? (
          <p className="text-sm text-secondary">Draft — not yet sealed</p>
        ) : capsule.state === 'withdrawn' ? (
          <p className="text-sm text-secondary">Withdrawn</p>
        ) : capsule.state === 'expired' ? (
          <p className="text-sm text-secondary">Expired</p>
        ) : null}
      </div>
    </Link>
  );
}
