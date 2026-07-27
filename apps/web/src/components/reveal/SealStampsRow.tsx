'use client';

import type { SealStatus } from '@tc/contracts';

const LABELS: Record<SealStatus['type'], string> = {
  place: 'Place',
  passphrase: 'Passphrase',
  identity: 'Identity',
};

/** Each remaining Seal as a wax stamp that visibly cracks once satisfied (02-UX-DESIGN.md §5.7). */
export function SealStampsRow({ seals, passphraseUnlocked }: { seals: SealStatus[]; passphraseUnlocked: boolean }) {
  if (seals.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {seals.map((seal) => {
        const satisfied = seal.type === 'passphrase' ? passphraseUnlocked : seal.satisfied;
        return (
          <span
            key={seal.type}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              satisfied
                ? 'border-[var(--color-accent-gold)]/40 bg-[var(--color-accent-gold)]/10 text-[var(--color-accent-gold)] line-through opacity-70'
                : 'border-[var(--color-text-secondary)]/30 text-secondary'
            }`}
          >
            <span aria-hidden>{satisfied ? '✓' : '🕯️'}</span>
            {LABELS[seal.type]} Seal
          </span>
        );
      })}
    </div>
  );
}
