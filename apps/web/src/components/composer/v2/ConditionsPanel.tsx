'use client';

import type { Seal } from '@tc/contracts';
import { Button, cn, Hallmark, Input, PasswordStrengthMeter } from '@tc/ui-web';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';

const SealMap = dynamic(() => import('../SealMap').then((m) => m.SealMap), { ssr: false });

/**
 * How long the record survives being read.
 *
 * Two questions rather than a ladder of nine radios. V1 listed Forever, 1 year,
 * 30 days, 7 days, 24 hours, 1 hour, 30 minutes, 5 minutes and Ephemeral as
 * peers, which is a menu, not a decision — and it hid the one option that
 * behaves differently in kind among eight that differ only in magnitude.
 */
const EXPIRY_LENGTHS = [
  { value: '1 year', label: 'A year' },
  { value: '30 days', label: 'Thirty days' },
  { value: '7 days', label: 'Seven days' },
  { value: '24 hours', label: 'A day' },
  { value: '1 hour', label: 'An hour' },
  { value: '5 minutes', label: 'Five minutes' },
] as const;

const EPHEMERAL = '0 seconds';

function findSeal(seals: Seal[], type: Seal['type']): Seal | undefined {
  return seals.find((s) => s.type === type);
}
function upsertSeal(seals: Seal[], seal: Seal): Seal[] {
  return [...seals.filter((s) => s.type !== seal.type), seal];
}
function removeSeal(seals: Seal[], type: Seal['type']): Seal[] {
  return seals.filter((s) => s.type !== type);
}

export interface ConditionsPanelProps {
  draft: CapsuleDraft;
  /** Delivery conditions only make sense where there is someone to deliver to. */
  hasRecipients: boolean;
  recipientName: string | null;
  className?: string;
}

/**
 * Everything that has to be true beyond the date.
 *
 * A detour, not a phase. Most capsules have no conditions at all, so Seal opens
 * as the review and this is one line away — which keeps the common path to a
 * single decision (Interaction Constitution 2) without hiding the capability
 * from anyone who wants it.
 *
 * Gathering the delivery toggles here with the cryptographic gates is
 * deliberate: whether Amara is told now, whether she can download, and whether
 * she must prove who she is are all answers to the same question — under what
 * conditions does this reach her. V1 split them between the recipients block
 * and a collapsed "Seals & Expiry" accordion, so nobody ever saw them together.
 */
export function ConditionsPanel({ draft, hasRecipients, recipientName, className }: ConditionsPanelProps) {
  const capsule = draft.capsule!;
  const seals = capsule.seals;
  const placeSeal = findSeal(seals, 'place');
  const passphraseSeal = findSeal(seals, 'passphrase');

  const [passphrase, setPassphrase] = useState('');
  const [hint, setHint] = useState(passphraseSeal?.type === 'passphrase' ? passphraseSeal.config.hint : '');
  const [placeName, setPlaceName] = useState(placeSeal?.type === 'place' ? placeSeal.config.name : '');
  const [placeOpen, setPlaceOpen] = useState(Boolean(placeSeal));
  const [passphraseOpen, setPassphraseOpen] = useState(Boolean(passphraseSeal));

  // The server treats `requireRecipientVerification` and an `identity` seal as
  // the same gate (`reveal/service.ts` — it ORs them), so only one is exposed.
  // Seals are the coherent model, since place and passphrase already live there
  // and the reveal renders them as a row of stamps.
  const identityOn = Boolean(findSeal(seals, 'identity')) || capsule.requireRecipientVerification;

  const who = recipientName ?? 'They';
  const expiry = capsule.expiresAfter;
  const isEphemeral = expiry === EPHEMERAL;
  const isKept = expiry === null;

  async function applyPassphrase() {
    if (!passphrase || !hint) return;
    const wrappedKeyB64 = await draft.wrapForPassphrase(passphrase);
    draft.patch({ seals: upsertSeal(seals, { type: 'passphrase', config: { hint, wrappedKeyB64 } }) });
  }

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      {hasRecipients ? (
        <section className="flex flex-col gap-3">
          <Hallmark>Delivery</Hallmark>
          <Check
            checked={capsule.announceOnSeal}
            onChange={(v) => draft.patch({ announceOnSeal: v })}
            label={`Tell ${who} now that something is waiting`}
            detail="Unchecked, they hear nothing until it opens."
          />
          <Check
            checked={capsule.allowDownload}
            onChange={(v) => draft.patch({ allowDownload: v })}
            label="They can keep a copy"
            detail="Download what is inside, to hold outside our walls."
          />
          <Check
            checked={capsule.recipientsVisible}
            onChange={(v) => draft.patch({ recipientsVisible: v })}
            label="They can see who else is receiving this"
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <Hallmark>Beyond the date</Hallmark>

        <Check
          checked={placeOpen}
          onChange={(v) => {
            setPlaceOpen(v);
            if (!v) draft.patch({ seals: removeSeal(seals, 'place') });
          }}
          label="It opens only at a place"
          detail={`${who} must be there to read it. A lock, not a memory — if they cannot reach it, they cannot read it.`}
        />
        {placeOpen ? (
          <div className="flex flex-col gap-2 border-l border-[var(--color-rule)] pl-4">
            <SealMap
              lat={placeSeal?.type === 'place' ? placeSeal.config.lat : undefined}
              lng={placeSeal?.type === 'place' ? placeSeal.config.lng : undefined}
              radiusM={placeSeal?.type === 'place' ? placeSeal.config.radiusM : 1000}
              onChange={(lat, lng, radiusM) =>
                draft.patch({
                  seals: upsertSeal(seals, {
                    type: 'place',
                    config: { lat, lng, radiusM, name: placeName || 'This place' },
                  }),
                })
              }
            />
            <Input
              label="What is this place called?"
              placeholder="Grandma's porch"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
            />
          </div>
        ) : null}

        <Check
          checked={passphraseOpen}
          onChange={(v) => {
            setPassphraseOpen(v);
            if (!v) draft.patch({ seals: removeSeal(seals, 'passphrase') });
          }}
          label="It needs a passphrase"
          detail="You will have to tell them separately. We cannot recover it."
        />
        {passphraseOpen ? (
          <div className="flex flex-col gap-2 border-l border-[var(--color-rule)] pl-4">
            <Input
              label="Passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <PasswordStrengthMeter password={passphrase} />
            <Input
              label="A hint, shown to them"
              placeholder="The street we grew up on"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!passphrase || !hint}
              onClick={() => void applyPassphrase()}
              className="self-start"
            >
              {passphraseSeal ? 'Update passphrase' : 'Set passphrase'}
            </Button>
          </div>
        ) : null}

        {hasRecipients ? (
          <Check
            checked={identityOn}
            onChange={(v) =>
              draft.patch({
                seals: v ? upsertSeal(seals, { type: 'identity', config: {} }) : removeSeal(seals, 'identity'),
                requireRecipientVerification: v,
              })
            }
            label={`${who} must prove who they are`}
            detail="A code sent to the address you named."
          />
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <Hallmark>After it is opened</Hallmark>
        <Radio
          checked={isKept}
          onSelect={() => draft.patch({ expiresAfter: null, expiryStrict: false })}
          label="Kept"
          detail="They can read it again for as long as they want."
        />
        <Radio
          checked={!isKept && !isEphemeral}
          onSelect={() => draft.patch({ expiresAfter: '1 year', expiryStrict: false })}
          label="Kept for a while, then gone"
        />
        {!isKept && !isEphemeral ? (
          <div className="border-l border-[var(--color-rule)] pl-4">
            <label htmlFor="expiry-length" className="sr-only">
              How long it is kept
            </label>
            <select
              id="expiry-length"
              value={expiry ?? '1 year'}
              onChange={(e) => draft.patch({ expiresAfter: e.target.value, expiryStrict: false })}
              className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
            >
              {EXPIRY_LENGTHS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Separated because it differs in kind, not in magnitude: every other
            option retires the record, this one destroys it. */}
        <div className="rounded-[var(--radius-input)] border border-[var(--color-danger)] p-3">
          <Radio
            checked={isEphemeral}
            onSelect={() => draft.patch({ expiresAfter: EPHEMERAL, expiryStrict: true })}
            label="One reading only"
            detail="The record is destroyed once they have read it. There is no copy, and this cannot be undone."
          />
        </div>
      </section>

      {capsule.type === 'self' ? (
        <section className="flex flex-col gap-3">
          <Hallmark>Opening early</Hallmark>
          <Check
            checked={capsule.breakGlass === 'allowed'}
            onChange={(v) => draft.patch({ breakGlass: v ? 'allowed' : 'disabled' })}
            label="Let yourself open it early"
            detail="Forty-eight hours between asking and opening, cancellable throughout."
          />
        </section>
      ) : null}
    </div>
  );
}

/*
 * Both controls below draw their own box/dot rather than showing the native
 * one — the same technique `Checkbox` in ui-web uses, and for the same
 * reason its docstring gives: a bare `<input type="checkbox">` or
 * `type="radio"` renders in the browser's own accent blue and ignores the
 * design system entirely, which stood out against every deliberately-styled
 * control around it here. `Checkbox` itself isn't reused because its API is
 * a single-line label; every row in this panel carries a label plus a
 * secondary detail line, which these keep.
 */
function Check({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  detail?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            'motion-instant pointer-events-none inline-flex h-4 w-4 items-center justify-center',
            'rounded-[2px] border border-[var(--color-rule-strong)] text-[var(--color-on-accent)]',
            'peer-checked:border-[var(--color-interactive)] peer-checked:bg-[var(--color-interactive)]',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
            'peer-focus-visible:outline-[var(--color-interactive)]',
            'peer-checked:[&>svg]:opacity-100',
          )}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0" fill="none">
            <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[length:var(--text-body-s)] text-foreground">{label}</span>
        {detail ? <span className="text-[length:var(--text-caption)] text-secondary">{detail}</span> : null}
      </span>
    </label>
  );
}

function Radio({
  checked,
  onSelect,
  label,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  detail?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0">
        <input
          type="radio"
          name="expiry"
          checked={checked}
          onChange={onSelect}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            'motion-instant pointer-events-none inline-flex h-4 w-4 items-center justify-center rounded-full',
            'border border-[var(--color-rule-strong)]',
            'peer-checked:border-[var(--color-interactive)]',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
            'peer-focus-visible:outline-[var(--color-interactive)]',
          )}
        >
          <span
            className={cn(
              'motion-instant h-2 w-2 scale-0 rounded-full bg-[var(--color-interactive)]',
              checked && 'scale-100',
            )}
          />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[length:var(--text-body-s)] text-foreground">{label}</span>
        {detail ? <span className="text-[length:var(--text-caption)] text-secondary">{detail}</span> : null}
      </span>
    </label>
  );
}
