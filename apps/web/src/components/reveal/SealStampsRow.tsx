'use client';

import type { SealStatus } from '@tc/contracts';
import { Hallmark, cn } from '@tc/ui-web';

const LABELS: Record<SealStatus['type'], string> = {
  place: 'Place',
  passphrase: 'Passphrase',
  identity: 'Identity',
};

/**
 * The conditions still standing between this capsule and its recipient.
 *
 * Meridian V2 rebuild. V1 drew wax stamps with a 🕯️ emoji in a `rounded-full`
 * pill — three separate violations:
 *
 * - `07 §VIII.5` bans emoji **absolutely**, no exceptions.
 * - `02 §IV.3` / `07 §II.3`: "We never draw an hourglass, a vault, a **stamp**,
 *   a clock face or a capsule." The wax seal is exactly the collection of
 *   instruments `02 §IV.2` reduces to one.
 * - `04 §7` permits a fully-round radius only for "avatars, dials, the transit
 *   marker". A chip takes the 3px control radius.
 *
 * What replaces it is a reading rather than a picture: each condition named in
 * the hallmark treatment, its state written out. `07 §V.4` requires exactly
 * that — "State is always stated in text, not only in colour, position, or
 * motion" — so "Met" and "Required" now do the work a struck-through pill and a
 * tick were doing by styling alone.
 */
export function SealStampsRow({ seals, passphraseUnlocked }: { seals: SealStatus[]; passphraseUnlocked: boolean }) {
  if (seals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4" aria-label="Conditions">
      {seals.map((seal) => {
        const satisfied = seal.type === 'passphrase' ? passphraseUnlocked : seal.satisfied;
        return (
          <div key={seal.type} className="flex flex-col gap-0.5">
            <Hallmark>{LABELS[seal.type]}</Hallmark>
            <span
              className={cn('text-[length:var(--text-body-s)]', satisfied ? 'text-secondary' : 'text-foreground')}
            >
              {satisfied ? 'Met' : 'Required'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
