'use client';

import type { ReceivedCapsule } from '@tc/contracts';
import { Button, Dialog, DualClock, DurationStamp, EmptyState, Hallmark, Skeleton, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { blocksApi, receivedApi } from '../../../lib/api-client';
import { useCorrectedNow } from '../../../lib/use-corrected-now';
import { formatAbsoluteDate } from '../../../lib/waiting';
import { CapsuleObject, StatedReading } from '../../../components/capsule/CapsuleObject';
import { PageTitle, appFrame } from '../../../components/page-frame';

const SECTION_HEADING: Record<ReceivedCapsule['section'], string> = {
  waiting: 'Ready to open',
  upcoming: 'Still sealed',
  opened: 'Opened',
};

/**
 * The reading on a received capsule — the same three the owner's side uses,
 * chosen by where the capsule is in its life.
 *
 * `upcoming` is the case that was broken: `ReceivedCapsuleSchema` carried no
 * `sealedAt`, so this drew half a Dual Clock — a bare `formatDuration` in the
 * clock's mono idiom with no TRAVELLED beside it. The contract now carries it,
 * and the recipient sees what the sender sees: how long this has already been
 * kept, next to how long is left.
 */
function ReceivedReading({ item }: { item: ReceivedCapsule }) {
  const unlockDate = item.unlockAt ? new Date(item.unlockAt) : null;
  const waiting = item.section === 'upcoming' && unlockDate !== null;
  const nowMs = useCorrectedNow(waiting ? unlockDate : null);
  const sealedMs = item.sealedAt ? new Date(item.sealedAt).getTime() : null;

  if (waiting && nowMs !== null && sealedMs !== null) {
    return <DualClock size="sm" elapsedMs={nowMs - sealedMs} remainingMs={unlockDate.getTime() - nowMs} />;
  }

  // `04 §10.4` — franked at the moment of opening, never during the wait. An
  // opened capsule has a final duration, so it gets the postmark rather than a
  // status word.
  if (item.section === 'opened' && sealedMs !== null && item.firstOpenedAt) {
    return <DurationStamp elapsedMs={new Date(item.firstOpenedAt).getTime() - sealedMs} />;
  }

  // `waiting` means the capsule has unlocked and has *not* been opened — so
  // "Opened <date>" was the one thing that had not happened. The date is the
  // moment it became readable.
  if (item.section === 'waiting') {
    return (
      <StatedReading
        label="Status"
        value={unlockDate ? `Unlocked ${formatAbsoluteDate(item.unlockAt!)}` : 'Ready to open'}
      />
    );
  }

  return <StatedReading label="Status" value={item.section === 'opened' ? 'Opened' : 'Sealed'} />;
}

/**
 * A received capsule.
 *
 * The same object the owner sees, drawn by the same component — what differs
 * is content, not form. It is identified by who it came from, because that is
 * what a letter addressed to you *is*, and it does not link anywhere: the key
 * that opens it lives in the fragment of the original link, which the server
 * has never held and this list therefore cannot reconstruct.
 *
 * V1's version had a coloured avatar circle with the sender's initial — an
 * identicon on an artifact, and the only place in the authenticated app
 * drawing a fully-round shape `04 §7` reserves for avatars, dials and the
 * transit marker. It is gone; the sender is stated in words.
 */
function ReceivedRow({ item, onManage }: { item: ReceivedCapsule; onManage: (item: ReceivedCapsule) => void }) {
  return (
    <CapsuleObject
      publicId={item.publicId}
      name={item.title ? { label: item.title, named: true } : { label: `From ${item.senderName}`, named: false }}
      detail={item.title ? `From ${item.senderName}` : null}
      reading={<ReceivedReading item={item} />}
      trailing={
        <button
          type="button"
          onClick={() => onManage(item)}
          className="motion-instant text-[length:var(--text-body-s)] text-secondary underline-offset-4 hover:text-foreground hover:underline"
        >
          Manage
        </button>
      }
    />
  );
}

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
] as const;

export default function ReceivedPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [managing, setManaging] = useState<ReceivedCapsule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['received'],
    queryFn: () => receivedApi.list(),
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!managing?.senderEmail) return;
      await blocksApi.create({ email: managing.senderEmail });
    },
    onSuccess: () => {
      setManaging(null);
      show('Sender blocked');
      void queryClient.invalidateQueries({ queryKey: ['received'] });
    },
  });

  const reportMutation = useMutation({
    mutationFn: (input: { reason: (typeof REPORT_REASONS)[number]['value'] }) => {
      if (!managing) throw new Error('No capsule selected');
      return receivedApi.report(managing.recipientId, input);
    },
    onSuccess: () => {
      setManaging(null);
      show('Reported');
      void queryClient.invalidateQueries({ queryKey: ['received'] });
    },
  });

  const items = data?.data ?? [];
  const sections: ReceivedCapsule['section'][] = ['waiting', 'upcoming', 'opened'];

  if (isLoading) {
    return (
      <div className={appFrame('flex flex-col gap-6')}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={appFrame()}>
        <EmptyState title="Nothing has been sent to you yet." />
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-9')}>
      <PageTitle>Received</PageTitle>

      {sections.map((section) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;
        return (
          <section key={section} className="flex flex-col gap-2">
            <Hallmark>{SECTION_HEADING[section]}</Hallmark>
            {sectionItems.map((item) => (
              <ReceivedRow key={item.recipientId} item={item} onManage={setManaging} />
            ))}
          </section>
        );
      })}

      {/*
        One shared `Dialog` replaces two hand-rolled things: a popover menu with
        no focus trap, no escape key and no outside-click, and a bespoke
        `fixed inset-0` modal built from a div with an onClick. Both actions
        live here together because both are about the same decision — what to
        do about a sender.
      */}
      <Dialog
        open={managing !== null}
        onOpenChange={(open) => !open && setManaging(null)}
        title={managing ? `From ${managing.senderName}` : ''}
        width="sm"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Hallmark>Stop hearing from them</Hallmark>
            <p className="text-[length:var(--text-body-s)] text-secondary">
              Blocking prevents this sender from addressing anything to you again. Capsules already sealed for you
              are unaffected — delivery is never gated on our side.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={!managing?.senderEmail || blockMutation.isPending}
              loading={blockMutation.isPending}
              onClick={() => blockMutation.mutate()}
            >
              Block this sender
            </Button>
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--color-rule)] pt-5">
            <Hallmark>Report it</Hallmark>
            <p className="text-[length:var(--text-body-s)] text-secondary">
              We never see what a capsule says, so a report tells us who sent it and why you flagged it — not its
              contents.
            </p>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((reason) => (
                <Button
                  key={reason.value}
                  variant="ghost"
                  size="sm"
                  disabled={reportMutation.isPending}
                  onClick={() => reportMutation.mutate({ reason: reason.value })}
                >
                  {reason.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
