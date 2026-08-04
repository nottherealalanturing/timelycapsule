'use client';

import { Button, Skeleton, useToast } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics';
import { capsulesApi, contactsApi, recipientsApi } from '../../lib/api-client';
import { envelopeText } from '../../lib/letter-envelope';
import { browserZone } from '../../lib/zoned-time';
import { useAuth } from '../../lib/auth-context';
import { type AutosaveStatus, useCapsuleDraft } from '../../lib/use-capsule-draft';
import { AddressMovement } from './v2/AddressMovement';
import { ComposeMovement } from './v2/ComposeMovement';
import { ACCOUNT_CAPABILITIES } from './v2/capabilities';
import { useEnclosures } from './v2/use-enclosures';
import { SealsBlock } from './SealsBlock';
import { SealCeremony } from './SealCeremony';
import { SealConfirmSheet } from './SealConfirmSheet';
import { firstCompletenessBlocker } from './completeness';

function statusText(status: AutosaveStatus): string {
  switch (status) {
    case 'pending':
      return 'Editing…';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved just now';
    case 'error':
      return "Couldn't save — retrying";
    default:
      return '';
  }
}

export interface InitialRecipient {
  email?: string;
  phone?: string;
  displayName?: string;
}

export function Composer({ capsuleId, initialRecipient }: { capsuleId: string; initialRecipient?: InitialRecipient }) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useAuth();
  const draft = useCapsuleDraft(capsuleId);
  const enclosures = useEnclosures(capsuleId, draft);
  const queryClient = useQueryClient();

  const recipientsKey = ['recipients', capsuleId] as const;
  const { data: recipients = [] } = useQuery({
    queryKey: recipientsKey,
    queryFn: async () => (await recipientsApi.list(capsuleId)).data,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await contactsApi.list()).data,
  });
  const [recipientError, setRecipientError] = useState<string | null>(null);

  const first = recipients[0];
  const addressee =
    draft.capsule?.type === 'self' ? null : (first?.displayName || first?.email || first?.phone || null);

  async function addRecipient(input: { email?: string; phone?: string; displayName?: string }) {
    setRecipientError(null);
    try {
      const { recipient, accessToken } = await recipientsApi.create(capsuleId, input);
      draft.registerRecipientToken(recipient.id, accessToken);
      await queryClient.invalidateQueries({ queryKey: recipientsKey });
    } catch {
      setRecipientError('That recipient could not be added.');
    }
  }

  async function removeRecipient(id: string) {
    await recipientsApi.delete(capsuleId, id);
    await queryClient.invalidateQueries({ queryKey: recipientsKey });
  }

  // "Start a capsule" from /people's birthday-upcoming section (02 §5.9) — add
  // the suggested contact once, if nothing has been added yet.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !initialRecipient || recipients.length > 0) return;
    prefilled.current = true;
    void addRecipient(initialRecipient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipient, recipients.length]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const openedFiredRef = useRef(false);

  useEffect(() => {
    if (openedFiredRef.current) return;
    openedFiredRef.current = true;
    track('composer_opened');
  }, []);

  async function handleClose() {
    await draft.flush();
    show('Draft saved');
    router.push('/home');
  }

  async function handleDeleteDraft() {
    await draft.flush();
    await capsulesApi.trash(capsuleId);
    router.push('/home');
  }

  async function handleConfirmSeal() {
    setSealing(true);
    try {
      await draft.flush();
      await capsulesApi.seal(capsuleId);
      track('capsule_sealed', { type: draft.capsule?.type });
      // Only now — right after seal succeeds — does "something is waiting" become true.
      // The link is built from the capsule key still held in this session's memory; the
      // server never sees it (T-14 decisions log).
      if (draft.capsule?.announceOnSeal) {
        await draft.sendAnnounceToAll(capsuleId);
      }
      setConfirmOpen(false);
      setCeremonyOpen(true);
    } catch {
      show("Couldn't seal the capsule. Please try again.");
    } finally {
      setSealing(false);
    }
  }

  function handleCeremonyDone() {
    const unlockAt = draft.capsule?.unlockAt;
    const sentence = unlockAt ? new Date(unlockAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '';
    show(sentence ? `Sealed. See you on ${sentence}.` : 'Sealed.');
    router.push('/home');
  }

  if (draft.loading || !draft.capsule) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Skeleton className="h-10 w-2/3" />
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const blocker = firstCompletenessBlocker(draft.capsule, envelopeText(draft.contentDoc).trim().length > 0);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-rule)] bg-[var(--color-bg-primary)]/95 px-6 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={handleClose}>
          Close
        </Button>
        {/* Autosave state is announced, not just shown — a draft silently
            failing to save is exactly the kind of thing a sighted user
            notices in the corner and a screen-reader user never learns. */}
        <span aria-live="polite" className="text-[length:var(--text-caption)] text-secondary">
          {statusText(draft.autosaveStatus)}
        </span>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Draft options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            •••
          </Button>
          {menuOpen ? (
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-1 shadow-md">
              <button
                type="button"
                onClick={handleDeleteDraft}
                role="menuitem"
                className="motion-instant w-full rounded-[var(--radius-input)] px-3 py-2 text-left text-[length:var(--text-body-s)] text-[var(--color-danger)] hover:bg-[var(--color-bg-primary)]"
              >
                Delete draft
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-14 px-6 py-10">
        <AddressMovement
          draft={draft}
          capabilities={ACCOUNT_CAPABILITIES}
          recipients={recipients}
          contacts={contacts}
          onAddRecipient={addRecipient}
          onRemoveRecipient={(id) => void removeRecipient(id)}
          recipientError={recipientError}
          selfBirthday={user?.birthday ?? null}
        />
        <ComposeMovement
          draft={draft}
          capabilities={ACCOUNT_CAPABILITIES}
          enclosures={enclosures}
          addressee={addressee}
          opensAt={draft.capsule.unlockAt ? new Date(draft.capsule.unlockAt) : null}
          tz={draft.capsule.unlockLocal?.tz ?? browserZone()}
          recipientLocal={draft.capsule.unlockMode === 'recipient_local'}
        />
        <SealsBlock draft={draft} />
      </main>

      <footer className="sticky bottom-0 border-t border-[var(--color-rule)] bg-[var(--color-bg-primary)]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <span className="text-[length:var(--text-body-s)] text-secondary">{blocker ?? 'Ready to seal'}</span>
          <Button disabled={Boolean(blocker)} onClick={() => setConfirmOpen(true)}>
            Seal capsule
          </Button>
        </div>
      </footer>

      <SealConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        capsule={draft.capsule}
        loading={sealing}
        onConfirm={handleConfirmSeal}
      />
      <SealCeremony open={ceremonyOpen} onDone={handleCeremonyDone} />
    </div>
  );
}
