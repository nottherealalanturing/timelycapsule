'use client';

import type { Seal } from '@tc/contracts';
import { PasswordStrengthMeter } from '@tc/ui-web';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';

const SealMap = dynamic(() => import('./SealMap').then((m) => m.SealMap), { ssr: false });

const EXPIRY_OPTIONS = [
  { label: 'Forever', value: null },
  { label: '1 year', value: '1 year' },
  { label: '30 days', value: '30 days' },
  { label: '7 days', value: '7 days' },
  { label: '24 hours', value: '24 hours' },
  { label: 'Ephemeral (one viewing)', value: '0 seconds', ephemeral: true },
] as const;

function findSeal(seals: Seal[], type: Seal['type']): Seal | undefined {
  return seals.find((s) => s.type === type);
}

function upsertSeal(seals: Seal[], seal: Seal): Seal[] {
  return [...seals.filter((s) => s.type !== seal.type), seal];
}

function removeSeal(seals: Seal[], type: Seal['type']): Seal[] {
  return seals.filter((s) => s.type !== type);
}

export function SealsBlock({ draft }: { draft: CapsuleDraft }) {
  const capsule = draft.capsule!;
  const seals = capsule.seals;
  const placeSeal = findSeal(seals, 'place');
  const passphraseSeal = findSeal(seals, 'passphrase');
  const identitySeal = findSeal(seals, 'identity');

  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [hint, setHint] = useState(passphraseSeal?.type === 'passphrase' ? passphraseSeal.config.hint : '');
  const [placeName, setPlaceName] = useState(placeSeal?.type === 'place' ? placeSeal.config.name : '');
  const [ephemeralConfirmed, setEphemeralConfirmed] = useState(false);

  async function applyPassphrase() {
    if (!passphrase || !hint) return;
    const wrappedKeyB64 = await draft.wrapForPassphrase(passphrase);
    draft.patch({ seals: upsertSeal(seals, { type: 'passphrase', config: { hint, wrappedKeyB64 } }) });
  }

  function applyPlace(lat: number, lng: number, radiusM: number) {
    draft.patch({
      seals: upsertSeal(seals, { type: 'place', config: { lat, lng, radiusM, name: placeName || 'This place' } }),
    });
  }

  function toggleIdentity(checked: boolean) {
    draft.patch({ seals: checked ? upsertSeal(seals, { type: 'identity', config: {} }) : removeSeal(seals, 'identity') });
  }

  const activeStamps = [
    capsule.unlockAt || capsule.unlockLocal ? 'Time' : null,
    placeSeal ? 'Place' : null,
    passphraseSeal ? 'Passphrase' : null,
    identitySeal ? 'Identity' : null,
  ].filter(Boolean) as string[];

  return (
    <section aria-label="Seals and expiry" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">Seals &amp; Expiry</span>
        <span className="text-xs text-secondary">{open ? 'Hide' : 'Show'}</span>
      </button>

      <div className="flex flex-wrap gap-2">
        {activeStamps.map((stamp) => (
          <span
            key={stamp}
            className="rounded-full border border-[var(--color-accent-gold,#c9a227)]/50 bg-[var(--color-accent-gold,#c9a227)]/10 px-3 py-1 text-xs font-medium text-foreground"
          >
            ✦ {stamp}
          </span>
        ))}
      </div>

      {open ? (
        <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 p-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Place Seal</h3>
            <p className="text-xs text-secondary">Recipients must be near this location to unwrap the key.</p>
            <SealMap
              lat={placeSeal?.type === 'place' ? placeSeal.config.lat : undefined}
              lng={placeSeal?.type === 'place' ? placeSeal.config.lng : undefined}
              radiusM={placeSeal?.type === 'place' ? placeSeal.config.radiusM : 1000}
              onChange={applyPlace}
            />
            <input
              placeholder="Nickname this place (e.g. Grandma&apos;s porch)"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent px-3 py-2 text-sm text-foreground"
            />
            {placeSeal ? (
              <button type="button" onClick={() => draft.patch({ seals: removeSeal(seals, 'place') })} className="self-start text-xs text-[var(--color-danger)]">
                Remove Place Seal
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Passphrase Seal</h3>
            <input
              type="password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent px-3 py-2 text-sm text-foreground"
            />
            <PasswordStrengthMeter password={passphrase} />
            <input
              placeholder="Hint (required — shown to recipients)"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent px-3 py-2 text-sm text-foreground"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void applyPassphrase()}
                disabled={!passphrase || !hint}
                className="self-start rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/30 px-3 py-1.5 text-xs text-foreground disabled:opacity-40"
              >
                {passphraseSeal ? 'Update Passphrase Seal' : 'Add Passphrase Seal'}
              </button>
              {passphraseSeal ? (
                <button type="button" onClick={() => draft.patch({ seals: removeSeal(seals, 'passphrase') })} className="text-xs text-[var(--color-danger)]">
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={Boolean(identitySeal)} onChange={(e) => toggleIdentity(e.target.checked)} />
            Require identity (OTP) to unlock
          </label>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Expiry</h3>
            <div className="flex flex-col gap-1">
              {EXPIRY_OPTIONS.map((opt) => (
                <label key={opt.label} className="flex items-center gap-2 text-sm text-secondary">
                  <input
                    type="radio"
                    name="expiry"
                    checked={capsule.expiresAfter === opt.value}
                    onChange={() => {
                      if ('ephemeral' in opt && opt.ephemeral && !ephemeralConfirmed) return;
                      draft.patch({ expiresAfter: opt.value, expiryStrict: 'ephemeral' in opt ? Boolean(opt.ephemeral) : false });
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {capsule.expiresAfter === '0 seconds' ? (
              <label className="flex items-center gap-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={ephemeralConfirmed}
                  onChange={(e) => {
                    setEphemeralConfirmed(e.target.checked);
                    if (e.target.checked) draft.patch({ expiresAfter: '0 seconds', expiryStrict: true });
                  }}
                />
                I understand this self-destructs after one viewing
              </label>
            ) : null}
          </div>

          {capsule.type === 'self' ? (
            <label className="flex items-center gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                checked={capsule.breakGlass === 'allowed'}
                onChange={(e) => draft.patch({ breakGlass: e.target.checked ? 'allowed' : 'disabled' })}
              />
              Allow opening early (48-hour delay, cancelable)
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
