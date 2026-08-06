'use client';

import type { CapsuleListItem, CapsuleState, CapsuleType } from '@tc/contracts';
import { Button, EmptyState, Hallmark, Skeleton } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CapsuleCard, resolveUnlockDate } from '../../../components/CapsuleCard';
import { CapsuleTimelineRow } from '../../../components/dashboard/CapsuleTimelineRow';
import { DashboardFilters } from '../../../components/dashboard/DashboardFilters';
import { capsulesApi, tagsApi } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { PageTitle, appFrame } from '../../../components/page-frame';

const TEMPLATES: { label: string; type: CapsuleType }[] = [
  { label: 'Letter to my future self', type: 'self' },
  { label: 'For someone special', type: 'personal' },
  { label: 'A birthday surprise', type: 'birthday' },
];

function greeting(atMs: number): string {
  const hour = new Date(atMs).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function timeBucket(capsule: CapsuleListItem, nowMs: number): string {
  const date = resolveUnlockDate(capsule) ?? new Date(capsule.createdAt);
  const now = new Date(nowMs);
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'This month';
  return String(date.getFullYear());
}

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [view, setView] = useState<'timeline' | 'grid'>('timeline');
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
  //
  // V1 additionally called `new Date()` inside `greeting()` and `timeBucket()`
  // during render, which is the same impurity the mountedAtMs pattern exists to
  // avoid and can disagree between server and client render. Both now read this
  // single mount instant.
  const [mountedAtMs] = useState(() => Date.now());

  const openingSoon = useMemo(
    () =>
      capsules
        .filter((c) => c.state === 'sealed' && resolveUnlockDate(c) && resolveUnlockDate(c)!.getTime() > mountedAtMs)
        .sort((a, b) => resolveUnlockDate(a)!.getTime() - resolveUnlockDate(b)!.getTime())
        .slice(0, 5),
    [capsules, mountedAtMs],
  );

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

  async function startTemplate(type: CapsuleType) {
    const { capsule } = await capsulesApi.create({ type });
    await queryClient.invalidateQueries({ queryKey: ['capsules'] });
    router.push(`/capsule/${capsule.id}/edit`);
  }

  if (isLoading) {
    return (
      <div className={appFrame('flex flex-col gap-6')}>
        <Skeleton className="h-7 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </div>
    );
  }

  if (capsules.length === 0 && !stateFilter && !typeFilter && !favoriteOnly && !tagFilter) {
    return (
      <div className={appFrame()}>
        {/* `07 §XI`: a genuinely empty account gets one line and one action —
            no illustration, no mascot, no encouragement. V1's "Your future is
            unwritten" sells; the voice states (`07 §VIII`). */}
        <EmptyState
          title="Nothing sealed yet."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {TEMPLATES.map((t) => (
                <Button key={t.type} variant="secondary" onClick={() => void startTemplate(t.type)}>
                  {t.label}
                </Button>
              ))}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-9')}>
      <header>
        <PageTitle>
          {greeting(mountedAtMs)}, {user?.displayName}
        </PageTitle>
      </header>

      {openingSoon.length > 0 ? (
        <section aria-label="Opening soon" className="flex flex-col gap-3">
          <Hallmark>Opening soon</Hallmark>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {openingSoon.map((capsule) => (
              <CapsuleCard key={capsule.id} capsule={capsule} className="w-64 shrink-0" />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-5">
        <DashboardFilters
          stateFilter={stateFilter}
          typeFilter={typeFilter}
          tagFilter={tagFilter}
          favoriteOnly={favoriteOnly}
          view={view}
          tags={allTags}
          onState={setStateFilter}
          onType={setTypeFilter}
          onTag={setTagFilter}
          onFavorite={() => setFavoriteOnly((v) => !v)}
          onView={setView}
        />

        {capsules.length === 0 ? (
          <p className="py-8 text-center text-[length:var(--text-body-s)] text-secondary">
            No capsules match these filters.
          </p>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capsules.map((capsule) => (
              <CapsuleCard key={capsule.id} capsule={capsule} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {grouped.map(([bucket, items]) => (
              <div key={bucket} className="flex flex-col gap-2">
                <Hallmark>{bucket}</Hallmark>
                {items.map((capsule) => (
                  <CapsuleTimelineRow key={capsule.id} capsule={capsule} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
