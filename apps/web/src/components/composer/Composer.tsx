'use client';

import { Button, cn, Skeleton, useToast } from '@tc/ui-web';
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
import { MovementNav, type Movement } from './v2/MovementNav';
import { SealMovement } from './v2/SealMovement';
import { ACCOUNT_CAPABILITIES } from './v2/capabilities';
import { useEnclosures } from './v2/use-enclosures';
import { SealCeremony } from './SealCeremony';
import { firstCompletenessBlocker } from './completeness';
import { describeSealFailure, type SealProblem } from './v2/seal-errors';
import { describeScheduleProblem, selectedInstant } from './v2/schedule-validity';
import { useCorrectedNow } from '../../lib/use-corrected-now';

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
    case 'rejected':
      // Deliberately not "retrying". The server refused this on its merits,
      // and `pendingPatchRef` will keep re-sending the same value until the
      // writer changes it — so promising a retry would be describing
      // something that cannot happen.
      return 'Not saved — see below';
    default:
      return '';
  }
}

/**
 * The way onward, at the end of a movement rather than pinned to the frame.
 *
 * `07 §IX` asks that sealing never be a side-effect of finishing a sentence,
 * and a sticky advance button is exactly that side-effect: always in view,
 * always one distracted tap away. Placing it after the work means reaching the
 * next movement is something a writer travels to.
 */
function Advance({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex justify-end pt-2">
      <Button onClick={onClick} disabled={disabled}>
        {children}
      </Button>
    </div>
  );
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
  const [movement, setMovement] = useState<Movement>('address');

  /*
   * One live reading of the chosen moment, computed here and handed to both
   * Address (where it is fixed) and Seal (where it blocks), so the two cannot
   * disagree. `useCorrectedNow` is reused rather than a local timer: it is
   * already the product's server-corrected clock, and a composer whose seal
   * validity depended on a wrong device clock would fail in exactly the way
   * this milestone exists to stop.
   */
  const scheduleTarget = draft.capsule ? selectedInstant(draft.capsule) : null;
  const scheduleNowMs = useCorrectedNow(scheduleTarget);
  const scheduleProblem = describeScheduleProblem(
    scheduleTarget,
    scheduleNowMs,
    ACCOUNT_CAPABILITIES.maxHorizonMs,
  );
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [sealProblem, setSealProblem] = useState<SealProblem | null>(null);
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

  // Set when sendAnnounceToAll reports a partial failure, and read by
  // handleCeremonyDone once the ceremony finishes — kept off `sealProblem`
  // deliberately, since sealing itself already succeeded by the time this
  // can be set; it's a delivery-notice problem, not a seal-blocking one.
  const announceFailureRef = useRef<{ failed: number; total: number } | null>(null);

  async function handleConfirmSeal() {
    setSealing(true);
    setSealProblem(null);
    announceFailureRef.current = null;
    try {
      await draft.flush();
      await capsulesApi.seal(capsuleId);
      track('capsule_sealed', { type: draft.capsule?.type });
      // Only now — right after seal succeeds — does "something is waiting" become true.
      // The link is built from the capsule key still held in this session's memory; the
      // server never sees it (T-14 decisions log).
      if (draft.capsule?.announceOnSeal) {
        const result = await draft.sendAnnounceToAll(capsuleId);
        // Sealing succeeded regardless — the capsule *will* deliver on
        // schedule either way (hard rule: delivery never depends on this
        // email). What can genuinely fail here is only the early heads-up,
        // so a failure here must never read as "sealing didn't work."
        if (result.failedRecipientIds.length > 0) {
          announceFailureRef.current = { failed: result.failedRecipientIds.length, total: result.total };
        }
      }
      setCeremonyOpen(true);
    } catch (error) {
      // Named on the surface instead of a generic toast — an upload still in
      // flight, a plan limit reached and a genuine fault each need a different
      // response from the writer, and "please try again" fits only the last.
      setSealProblem(describeSealFailure(error));
    } finally {
      setSealing(false);
    }
  }

  function handleCeremonyDone() {
    const unlockAt = draft.capsule?.unlockAt;
    const sentence = unlockAt ? new Date(unlockAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '';
    show(sentence ? `Sealed. See you on ${sentence}.` : 'Sealed.');

    const announceFailure = announceFailureRef.current;
    if (announceFailure) {
      const who = announceFailure.failed === announceFailure.total ? 'them' : `${announceFailure.failed} of them`;
      // A second, distinct toast rather than folding this into the seal
      // message above — the two are different facts (sealed vs. notified)
      // and collapsing them into one line is exactly what would let this
      // read as "sealing partially failed," which isn't true.
      show(`We couldn't reach ${who} just now to say something's waiting — they'll still get it when it opens.`, {
        variant: 'danger',
      });
    }

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
  const hasMoment = Boolean(draft.capsule.unlockAt || draft.capsule.unlockLocal);
  const opensAt = draft.capsule.unlockAt ? new Date(draft.capsule.unlockAt) : null;
  const tz = draft.capsule.unlockLocal?.tz ?? browserZone();
  const recipientLocal = draft.capsule.unlockMode === 'recipient_local';

  // Movements ahead of the work stay unlit rather than gated: you cannot review
  // a capsule with no letter, but nothing stops you going back for one.
  const reachable: Movement[] = ['address'];
  if (hasMoment) reachable.push('compose');
  if (!blocker) reachable.push('seal');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--color-rule)] bg-[var(--color-bg-primary)]/95 px-6 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={handleClose}>
          Close
        </Button>
        <MovementNav current={movement} available={reachable} onGo={setMovement} />
        {/* Autosave state is announced, not just shown — a draft silently
            failing to save is exactly the kind of thing a sighted user
            notices in the corner and a screen-reader user never learns. */}
        <span
          aria-live="polite"
          className={cn(
            'hidden text-[length:var(--text-caption)] sm:block',
            draft.autosaveStatus === 'rejected' ? 'text-[var(--color-danger)]' : 'text-secondary',
          )}
        >
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
        {movement === 'address' ? (
          <AddressMovement
            draft={draft}
            capabilities={ACCOUNT_CAPABILITIES}
            recipients={recipients}
            contacts={contacts}
            onAddRecipient={addRecipient}
            onRemoveRecipient={(id) => void removeRecipient(id)}
            recipientError={recipientError}
            selfBirthday={user?.birthday ?? null}
            scheduleProblem={scheduleProblem}
            footer={
              // Says why it cannot advance, the same way the Compose footer
              // does with `blocker`. It was previously just dead and silent —
              // a first-time writer presses it, nothing happens, and nothing
              // anywhere says a moment is what is missing (`07 §V.10`: state
              // what happened and what to do next). Phrase borrowed verbatim
              // from `firstCompletenessBlocker` so the two footers speak with
              // one voice.
              <Advance onClick={() => setMovement('compose')} disabled={!hasMoment}>
                {hasMoment ? 'Compose' : 'Choose when it opens'}
              </Advance>
            }
          />
        ) : null}

        {movement === 'compose' ? (
          <ComposeMovement
            draft={draft}
            capabilities={ACCOUNT_CAPABILITIES}
            enclosures={enclosures}
            addressee={addressee}
            opensAt={opensAt}
            tz={tz}
            recipientLocal={recipientLocal}
            footer={
              <Advance onClick={() => setMovement('seal')} disabled={Boolean(blocker)}>
                {blocker ?? 'Review'}
              </Advance>
            }
          />
        ) : null}

        {movement === 'seal' ? (
          <SealMovement
            draft={draft}
            capabilities={ACCOUNT_CAPABILITIES}
            enclosures={enclosures.items}
            addressee={addressee}
            opensAt={opensAt}
            tz={tz}
            recipientLocal={recipientLocal}
            hasRecipients={recipients.length > 0}
            uploadsInFlight={enclosures.uploading.length}
            sealing={sealing}
            onSeal={handleConfirmSeal}
            problem={sealProblem}
            scheduleProblem={scheduleProblem}
            onGoToAddress={() => setMovement('address')}
          />
        ) : null}
      </main>

      <SealCeremony open={ceremonyOpen} onDone={handleCeremonyDone} />
    </div>
  );
}
