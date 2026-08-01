'use client';

import { Button, Skeleton, useToast } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics';
import { capsulesApi } from '../../lib/api-client';
import { type AutosaveStatus, useCapsuleDraft } from '../../lib/use-capsule-draft';
import { CoverBlock } from './CoverBlock';
import { LetterBlock } from './LetterBlock';
import { MediaBlock } from './MediaBlock';
import { RecipientsBlock } from './RecipientsBlock';
import { ScheduleBlock } from './ScheduleBlock';
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
  const draft = useCapsuleDraft(capsuleId);
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

  const blocker = firstCompletenessBlocker(draft.capsule);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-text-secondary)]/15 bg-[var(--color-bg)]/95 px-6 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={handleClose}>
          Close
        </Button>
        <span className="text-xs text-secondary">{statusText(draft.autosaveStatus)}</span>
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setMenuOpen((v) => !v)}>
            •••
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-[var(--color-bg-raised)] p-1 shadow-md">
              <button
                type="button"
                onClick={handleDeleteDraft}
                className="w-full rounded-[var(--radius-input)] px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-bg)]"
              >
                Delete draft
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
        <CoverBlock draft={draft} />
        <LetterBlock draft={draft} />
        <MediaBlock capsuleId={capsuleId} draft={draft} />
        <RecipientsBlock capsuleId={capsuleId} capsuleType={draft.capsule.type} draft={draft} initialRecipient={initialRecipient} />
        <ScheduleBlock draft={draft} />
        <SealsBlock draft={draft} />
      </main>

      <footer className="sticky bottom-0 border-t border-[var(--color-text-secondary)]/15 bg-[var(--color-bg)]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <span className="text-sm text-secondary">{blocker ?? 'Ready to seal'}</span>
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
