'use client';

import type { Capsule, Contact, MediaItem, PatchCapsuleRequest, Recipient } from '@tc/contracts';
import { useState } from 'react';
import { AddressMovement } from '../../../components/composer/v2/AddressMovement';
import { ComposeMovement } from '../../../components/composer/v2/ComposeMovement';
import { MovementNav, type Movement } from '../../../components/composer/v2/MovementNav';
import { SealMovement } from '../../../components/composer/v2/SealMovement';
import { ACCOUNT_CAPABILITIES, GUEST_CAPABILITIES } from '../../../components/composer/v2/capabilities';
import { noEnclosures } from '../../../components/composer/v2/use-enclosures';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';

/**
 * Dev-only harness for composer movements.
 *
 * The composer sits behind auth, an unwrapped master key and a live capsule, so
 * iterating on it in a browser otherwise costs a signup and a key ceremony per
 * change. This mounts a movement against an in-memory draft and prints what it
 * writes, which is what you actually need to see when checking that a control
 * stores what it displays.
 *
 * Not linked from anywhere and it renders nothing outside development.
 */

const LETTER = {
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Dear Amara,' }] },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'I am writing this on the night you were born, in a corridor on the third floor, because there is nowhere to sit and I cannot stop shaking.',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'You are eleven hours old. By the time you read this you will be older than I can picture.' }],
      },
    ],
  },
  writtenAt: { name: 'Lagos Island Maternity Hospital', lat: 6.4531, lng: 3.3958 },
};

const BASE: Partial<Capsule> = {
  id: 'dev-harness',
  title: null,
  type: 'personal',
  state: 'draft',
  unlockMode: 'absolute',
  unlockAt: new Date('2036-03-11T08:00:00Z').toISOString(),
  unlockLocal: null,
  recurrence: null,
  seals: [],
  expiresAfter: null,
  expiryStrict: false,
  breakGlass: 'disabled',
  recipientsVisible: false,
  allowDownload: true,
  announceOnSeal: true,
  requireRecipientVerification: false,
  sizeBytes: 0,
};

const AMARA = {
  recipient: { id: 'r1', displayName: 'Amara Okonkwo', email: 'amara@example.com', phone: null } as unknown as Recipient,
  contact: { id: 'c1', name: 'Amara Okonkwo', email: 'amara@example.com', phone: null, birthday: '2026-03-11' } as unknown as Contact,
};

const MEDIA: MediaItem[] = [
  { id: 'm1', kind: 'image', originalName: 'first-night.jpg', sizeBytes: 2_411_000, caption: null, position: 0 } as unknown as MediaItem,
  { id: 'm2', kind: 'audio', originalName: 'voice-note.webm', sizeBytes: 480_000, caption: 'A voice note', position: 1 } as unknown as MediaItem,
];

export default function ComposerHarness() {
  const [capsule, setCapsule] = useState(BASE as Capsule);
  const [contentDoc, setContentDoc] = useState<unknown>(LETTER);
  const [movement, setMovement] = useState<Movement>('seal');
  const [asGuest, setAsGuest] = useState(false);
  const [withRecipient, setWithRecipient] = useState(true);

  if (process.env.NODE_ENV !== 'development') return null;

  const draft: CapsuleDraft = {
    capsule,
    contentDoc,
    loading: false,
    ready: true,
    autosaveStatus: 'idle',
    patch: (fields: PatchCapsuleRequest) => setCapsule((prev) => ({ ...prev, ...fields }) as Capsule),
    setContentDoc,
    flush: async () => {},
    encryptForCapsule: async (b) => b,
    wrapForPassphrase: async () => 'wrapped',
    registerRecipientToken: () => {},
    sendAnnounceToAll: async () => {},
  };

  const capabilities = asGuest ? GUEST_CAPABILITIES : ACCOUNT_CAPABILITIES;
  const recipients = withRecipient && !asGuest ? [AMARA.recipient] : [];
  const addressee = capsule.type === 'self' ? null : (recipients[0]?.displayName ?? null);
  const opensAt = capsule.unlockAt ? new Date(capsule.unlockAt) : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 font-mono text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={asGuest} onChange={(e) => setAsGuest(e.target.checked)} />
          guest
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={withRecipient} onChange={(e) => setWithRecipient(e.target.checked)} />
          recipient
        </label>
        <MovementNav current={movement} available={['address', 'compose', 'seal']} onGo={setMovement} />
      </div>

      {movement === 'address' ? (
        <AddressMovement
          draft={draft}
          capabilities={capabilities}
          recipients={recipients}
          contacts={[AMARA.contact]}
          onAddRecipient={async () => setWithRecipient(true)}
          onRemoveRecipient={() => setWithRecipient(false)}
          selfBirthday="1986-04-02"
        />
      ) : null}

      {movement === 'compose' ? (
        <ComposeMovement
          draft={draft}
          capabilities={capabilities}
          enclosures={noEnclosures()}
          addressee={addressee}
          opensAt={opensAt}
          tz="Africa/Lagos"
        />
      ) : null}

      {movement === 'seal' ? (
        <SealMovement
          draft={draft}
          capabilities={capabilities}
          enclosures={asGuest ? [] : MEDIA}
          addressee={addressee}
          opensAt={opensAt}
          tz="Africa/Lagos"
          hasRecipients={recipients.length > 0}
          sealing={false}
          onSeal={() => {}}
        />
      ) : null}

      <pre className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-rule)] p-4 font-mono text-[10px] leading-relaxed text-secondary">
        {JSON.stringify(
          {
            title: capsule.title,
            type: capsule.type,
            seals: capsule.seals.map((s) => s.type),
            expiresAfter: capsule.expiresAfter,
            expiryStrict: capsule.expiryStrict,
            announceOnSeal: capsule.announceOnSeal,
            allowDownload: capsule.allowDownload,
            recipientsVisible: capsule.recipientsVisible,
            requireRecipientVerification: capsule.requireRecipientVerification,
            breakGlass: capsule.breakGlass,
          },
          null,
          1,
        )}
      </pre>
    </div>
  );
}
