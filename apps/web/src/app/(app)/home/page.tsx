'use client';

import type { CapsuleListItem, CapsuleState, CapsuleType } from '@tc/contracts';
import { Button, EmptyState, Hallmark, Skeleton } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CapsuleRow } from '../../../components/capsule/CapsuleRow';
import { DashboardFilters } from '../../../components/dashboard/DashboardFilters';
import { capsulesApi, tagsApi } from '../../../lib/api-client';
import { formatAbsoluteDate, resolveUnlockDate } from '../../../lib/waiting';
import { appFrame } from '../../../components/page-frame';

function timeBucket(capsule: CapsuleListItem, nowMs: number): string {
  const date = resolveUnlockDate(capsule) ?? new Date(capsule.createdAt);
  const now = new Date(nowMs);
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'This month';
  return String(date.getFullYear());
}

/**
 * What is in custody, and what is nearest to opening.
 *
 * This replaces *"Good evening, Assad Eesaa"*. `07 §VIII` puts the register
 * "closer to a shipping manifest or a land registry than to a greetings card",
 * and a time-of-day pleasantry was both the largest text on the product's main
 * screen and the only thing on it that carried no information. An archive
 * opens by stating what it holds.
 *
 * It also absorbs the "Opening soon" strip, which rendered full cards for
 * capsules that appeared again in the list directly beneath — the same capsule
 * twice on one screen, with the same reading. The nearest opening is a fact
 * worth stating once, in a line, not a second copy of the object.
 */
function CustodyReading({ capsules, nowMs }: { capsules: CapsuleListItem[]; nowMs: number }) {
  const sealed = capsules.filter((c) => c.state === 'sealed');
  const drafts = capsules.filter((c) => c.state === 'draft');

  const nearest = sealed
    .map((c) => ({ capsule: c, at: resolveUnlockDate(c) }))
    .filter((x): x is { capsule: CapsuleListItem; at: Date } => x.at !== null && x.at.getTime() > nowMs)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  const held: string[] = [];
  if (sealed.length > 0) held.push(`${sealed.length} sealed`);
  if (drafts.length > 0) held.push(`${drafts.length} draft${drafts.length === 1 ? '' : 's'}`);

  return (
    <section aria-label="In custody" className="flex flex-col gap-2">
      <Hallmark>In custody</Hallmark>
      <p className="text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground">
        {held.length > 0 ? held.join(', ') : 'Nothing sealed yet'}
      </p>
      {nearest ? (
        <p className="text-[length:var(--text-body-s)] text-secondary">
          The nearest opens {formatAbsoluteDate(nearest.at.toISOString())}.
        </p>
      ) : null}
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stateFilter, setStateFilter] = useState<CapsuleState | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<CapsuleType | undefined>(undefined);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | undefined>(undefined);

  const { data: tagsData } = useQuery({ queryKey: ['tags'], queryFn: () => tagsApi.list() });
  const allTags = tagsData?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['capsules', stateFilter, typeFilter, favoriteOnly, tagFilter],
    queryFn: () =>
      capsulesApi.list({
        state: stateFilter,
        type: typeFilter,
        favorite: favoriteOnly || undefined,
        tag: tagFilter,
        limit: 100,
      }),
  });
  const capsules = useMemo(() => data?.data ?? [], [data]);

  // Date.now() is impure and can't be called during render (react-hooks/purity)
  // — a useState lazy initializer is the sanctioned escape hatch, same
  // pattern as ScheduleBlock's mountedAtMs in T-11.
  const [mountedAtMs] = useState(() => Date.now());

  const grouped = useMemo(() => {
    const buckets = new Map<string, CapsuleListItem[]>();
    for (const capsule of capsules) {
      const bucket = timeBucket(capsule, mountedAtMs);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), capsule]);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) =>
      a === 'This month' ? -1 : b === 'This month' ? 1 : a.localeCompare(b),
    );
  }, [capsules, mountedAtMs]);

  const filtered = Boolean(stateFilter || typeFilter || favoriteOnly || tagFilter);

  async function startFirst() {
    const { capsule } = await capsulesApi.create({ type: 'self' });
    await queryClient.invalidateQueries({ queryKey: ['capsules'] });
    router.push(`/capsule/${capsule.id}/edit`);
  }

  if (isLoading) {
    return (
      <div className={appFrame('flex flex-col gap-6')}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (capsules.length === 0 && !filtered) {
    return (
      <div className={appFrame()}>
        {/* `07 §XI`: a genuinely empty account gets one line and one action —
            no illustration, no mascot, no encouragement. The three template
            buttons that stood here were three actions, and "A birthday
            surprise" was the template framing `07 §IX` rules out. */}
        <EmptyState
          title="Nothing sealed yet."
          action={<Button onClick={() => void startFirst()}>Write the first one</Button>}
        />
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-9')}>
      <CustodyReading capsules={capsules} nowMs={mountedAtMs} />

      <section className="flex flex-col gap-5">
        <DashboardFilters
          stateFilter={stateFilter}
          typeFilter={typeFilter}
          tagFilter={tagFilter}
          favoriteOnly={favoriteOnly}
          tags={allTags}
          onState={setStateFilter}
          onType={setTypeFilter}
          onTag={setTagFilter}
          onFavorite={() => setFavoriteOnly((v) => !v)}
        />

        {capsules.length === 0 ? (
          <p className="py-8 text-[length:var(--text-body-s)] text-secondary">No capsules match these filters.</p>
        ) : (
          <div className="flex flex-col gap-7">
            {grouped.map(([bucket, items]) => (
              <div key={bucket} className="flex flex-col gap-2">
                <Hallmark>{bucket}</Hallmark>
                {items.map((capsule) => (
                  <CapsuleRow key={capsule.id} capsule={capsule} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
