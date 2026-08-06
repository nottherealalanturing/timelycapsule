'use client';

import type { ReceivedCapsule } from '@tc/contracts';
import { Button, EmptyState, Skeleton, formatDuration } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { blocksApi, receivedApi } from '../../../lib/api-client';
import { useCorrectedNow } from '../../../lib/use-corrected-now';
import { formatAbsoluteDate } from '../../../lib/waiting';
import { PageTitle, appFrame } from '../../../components/page-frame';

const SECTION_COPY: Record<ReceivedCapsule['section'], { heading: string; empty: string }> = {
  waiting: { heading: 'Waiting to open', empty: '' },
  upcoming: { heading: 'Upcoming', empty: '' },
  opened: { heading: 'Opened', empty: '' },
};

function coverStyle(cover: ReceivedCapsule['cover']): React.CSSProperties {
  if (cover?.kind === 'gradient') return { background: cover.value };
  return { background: 'var(--color-bg-raised)' };
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * The remaining figure in the Dual Clock's typographic idiom — mono, tabular,
 * two largest units — rather than V1's prose countdown ("12 years").
 *
 * Not the full `DualClock`: `ReceivedCapsuleSchema` carries no `sealedAt`, so
 * elapsed is unavailable on every recipient-facing surface. See the note on
 * `LockedWait` in the reveal page — the gap is reported, not faked.
 */
function RemainingFigure({ unlockAt }: { unlockAt: string }) {
  const target = new Date(unlockAt);
  const nowMs = useCorrectedNow(target);
  if (nowMs === null) return null;
  return (
    <span className="whitespace-nowrap font-[family-name:var(--font-mono)] tabular-nums">
      {formatDuration(Math.max(0, target.getTime() - nowMs))}
    </span>
  );
}

function ReceivedRow({ item, onReport }: { item: ReceivedCapsule; onReport: (item: ReceivedCapsule) => void }) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!item.senderEmail) return;
      await blocksApi.create({ email: item.senderEmail });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['received'] }),
  });

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-rule)] p-3">
      <div
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-foreground"
        style={coverStyle(item.cover)}
      >
        {initial(item.senderName)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title || 'Untitled capsule'}</p>
        <p className="truncate text-sm text-secondary">
          From {item.senderName}
          {/*
            The absolute date always accompanies the relative figure
            (`07 §VIII.4`) — and the figure only appears where there is
            genuinely something remaining. The `waiting` section is *already
            unlocked* and merely unopened, so V1's countdown rendered a
            meaningless `00:00` there; it now states, in the past tense
            (`09 §XVI`), that the capsule has arrived.
          */}
          {item.unlockAt && item.section === 'upcoming' ? (
            <>
              {' '}
              &middot; {formatAbsoluteDate(item.unlockAt)} &middot;{' '}
              <RemainingFigure unlockAt={item.unlockAt} />
            </>
          ) : item.unlockAt && item.section === 'waiting' ? (
            <> &middot; Unlocked {formatAbsoluteDate(item.unlockAt)}</>
          ) : null}
        </p>
      </div>

      <div className="relative">
        <Button variant="ghost" size="sm" aria-label="More actions" onClick={() => setMenuOpen((v) => !v)}>
          ⋯
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] py-1 shadow-md">
            <button
              type="button"
              disabled={!item.senderEmail || blockMutation.isPending}
              onClick={() => {
                setMenuOpen(false);
                void blockMutation.mutate();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-[var(--color-bg-base)] disabled:opacity-40"
            >
              Block sender
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onReport(item);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-bg-base)]"
            >
              Report
            </button>
          </div>
        ) : null}
      </div>
    </div>
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
  const [reporting, setReporting] = useState<ReceivedCapsule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['received'],
    queryFn: () => receivedApi.list(),
  });

  const reportMutation = useMutation({
    mutationFn: (input: { reason: (typeof REPORT_REASONS)[number]['value'] }) => {
      if (!reporting) throw new Error('No capsule selected');
      return receivedApi.report(reporting.recipientId, input);
    },
    onSuccess: () => {
      setReporting(null);
      void queryClient.invalidateQueries({ queryKey: ['received'] });
    },
  });

  const items = data?.data ?? [];
  const sections: ReceivedCapsule['section'][] = ['waiting', 'upcoming', 'opened'];

  if (isLoading) {
    return (
      <div className={appFrame('flex flex-col gap-4')}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={appFrame()}>
        <EmptyState
          title="Nothing yet — but the future is long."
          action={<p className="text-sm text-secondary">Invite someone to exchange capsules.</p>}
        />
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-8')}>
      <PageTitle>Received</PageTitle>

      {sections.map((section) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;
        return (
          <section key={section} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-secondary">{SECTION_COPY[section].heading}</h2>
            <div className="flex flex-col gap-2">
              {sectionItems.map((item) => (
                <ReceivedRow key={item.recipientId} item={item} onReport={setReporting} />
              ))}
            </div>
          </section>
        );
      })}

      {reporting ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40" onClick={() => setReporting(null)}>
          <div
            className="w-full max-w-sm rounded-[var(--radius-modal)] bg-[var(--color-bg-raised)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-[var(--font-display)] text-lg text-foreground">Report this capsule</h2>
            <p className="mt-1 text-sm text-secondary">What’s the issue with “{reporting.title || 'this capsule'}”?</p>
            <div className="mt-4 flex flex-col gap-2">
              {REPORT_REASONS.map((reason) => (
                <Button
                  key={reason.value}
                  variant="secondary"
                  fullWidth
                  loading={reportMutation.isPending}
                  onClick={() => reportMutation.mutate({ reason: reason.value })}
                >
                  {reason.label}
                </Button>
              ))}
              <Button variant="ghost" fullWidth onClick={() => setReporting(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
