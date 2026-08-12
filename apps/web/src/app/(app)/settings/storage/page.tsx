'use client';

import { Skeleton } from '@tc/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { settingsApi } from '../../../../lib/api-client';
import { capsuleName } from '../../../../components/capsule/CapsuleRow';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** `07 §VIII` rule 4 — a date in the record is literal and absolute, never only relative. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * **Storage, as a reading.**
 *
 * This page used to be a percentage bar over a list — the shape every cloud
 * service uses, and the wrong one here. A bar exists to make you feel a
 * threshold approaching; that is its whole rhetorical job. But the thing
 * being measured is somebody's custody of their own letters, and the
 * product's answer to "how much have I used" should be a sentence, in the
 * same register as `07 §V.4`'s "state it in text" and the Dual Clock's
 * readings elsewhere. Numbers stated plainly, no gauge.
 *
 * The section that matters most is **Released**. Bytes that have been
 * reclaimed are not silently deducted and forgotten — they are reported as
 * a fact of the account's history, because the enclosures really existed
 * and the record still knows their names. The one thing this page must
 * never do is let storage quietly shrink and say nothing.
 *
 * It also has to hold a distinction that is easy to get wrong: the
 * allowance shown here governs **what can be added next**, and nothing
 * else. It has no authority over a capsule that is already sealed. That is
 * stated outright rather than implied, because the natural assumption from
 * every other product is the opposite one.
 */
export default function StorageSettingsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['storage'], queryFn: () => settingsApi.getStorage() });

  if (isLoading || !data) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  const held = data.largest.filter((c) => c.sizeBytes > 0);

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <h2 className="font-[var(--font-display)] text-lg text-foreground">Storage</h2>

      <section className="flex flex-col gap-1.5">
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
          In storage
        </span>
        <p className="text-[length:var(--text-body)] text-foreground">
          {formatBytes(data.usedBytes)} held
          {held.length > 0 ? ` across ${held.length === 1 ? 'one capsule' : `${held.length} capsules`}` : ''}.
        </p>
        <p className="text-sm text-secondary">
          {data.quotaBytes === null
            ? 'This account has no storage limit.'
            : `This account allows ${formatBytes(data.quotaBytes)}.`}
        </p>
      </section>

      {data.releasedBytes > 0 ? (
        <section className="flex flex-col gap-1.5">
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
            Released
          </span>
          <p className="text-[length:var(--text-body)] text-foreground">
            {formatBytes(data.releasedBytes)} released from{' '}
            {data.releasedCapsuleCount === 1 ? 'one capsule' : `${data.releasedCapsuleCount} capsules`}.
          </p>
          <p className="text-sm text-secondary">
            Those capsules kept their letters, their dates and any replies. Only the enclosed files were
            removed at the end of the storage period each was sealed with.
          </p>
        </section>
      ) : null}

      {data.nextRelease ? (
        <section className="flex flex-col gap-1.5">
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
            Next release
          </span>
          <p className="text-[length:var(--text-body)] text-foreground">
            <Link href={`/capsule/${data.nextRelease.capsuleId}`} className="underline underline-offset-2">
              {capsuleName(data.nextRelease).label}
            </Link>{' '}
            on {formatDate(data.nextRelease.releaseAt)}.
          </p>
          <p className="text-sm text-secondary">You&rsquo;ll be told a month before, and again a week before.</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
          Largest
        </span>
        {held.length === 0 ? (
          <p className="text-sm text-secondary">Nothing enclosed yet.</p>
        ) : (
          held.map((capsule) => (
            <Link
              key={capsule.id}
              href={`/capsule/${capsule.id}`}
              className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-rule)] px-4 py-3 text-sm hover:bg-[var(--color-bg-raised)]"
            >
              <span className="text-foreground">{capsuleName(capsule).label}</span>
              <span className="font-[family-name:var(--font-mono)] text-secondary">
                {formatBytes(capsule.sizeBytes)}
              </span>
            </Link>
          ))
        )}
      </section>

      {/*
        Stated, not buried in a tooltip. Every other product trains people to
        assume their current plan governs everything they have ever made, and
        here it emphatically does not — a sealed capsule keeps the terms it
        was sealed with no matter what happens to this number afterwards.
      */}
      <p className="border-l-2 border-[var(--color-rule-strong)] pl-4 text-sm text-secondary">
        This allowance decides what you can add next. It has no effect on capsules you have already sealed —
        those keep the storage and delivery terms they were sealed with, whatever happens to your plan.
      </p>
    </div>
  );
}
