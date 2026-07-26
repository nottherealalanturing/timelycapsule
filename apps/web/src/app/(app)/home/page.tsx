'use client';

import type { CapsuleListItem, CapsuleState, CapsuleType } from '@tc/contracts';
import { Button, EmptyState, Skeleton } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CapsuleCard, resolveUnlockDate } from '../../../components/CapsuleCard';
import { CountdownDisplay } from '../../../components/CountdownDisplay';
import { capsulesApi } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

const TEMPLATES: { label: string; type: CapsuleType }[] = [
  { label: 'Letter to my future self', type: 'self' },
  { label: 'For someone special', type: 'personal' },
  { label: 'A birthday surprise', type: 'birthday' },
];

const STATE_FILTERS: { label: string; value: CapsuleState | undefined }[] = [
  { label: 'All states', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Sealed', value: 'sealed' },
  { label: 'Unlocked', value: 'unlocked' },
  { label: 'Expired', value: 'expired' },
  { label: 'Withdrawn', value: 'withdrawn' },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function timeBucket(capsule: CapsuleListItem): string {
  const date = resolveUnlockDate(capsule) ?? new Date(capsule.createdAt);
  const now = new Date();
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

  const { data, isLoading } = useQuery({
    queryKey: ['capsules', stateFilter, typeFilter],
    queryFn: () => capsulesApi.list({ state: stateFilter, type: typeFilter, limit: 100 }),
  });
  const capsules = useMemo(() => data?.data ?? [], [data]);

  // Date.now() is impure and can't be called during render (react-hooks/purity)
  // — a useState lazy initializer is the sanctioned escape hatch, same
  // pattern as ScheduleBlock's mountedAtMs in T-11.
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
      const bucket = timeBucket(capsule);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), capsule]);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => (a === 'This month' ? -1 : b === 'This month' ? 1 : a.localeCompare(b)));
  }, [capsules]);

  async function startTemplate(type: CapsuleType) {
    const { capsule } = await capsulesApi.create({ type });
    await queryClient.invalidateQueries({ queryKey: ['capsules'] });
    router.push(`/capsule/${capsule.id}/edit`);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 px-8 py-10">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (capsules.length === 0 && !stateFilter && !typeFilter) {
    return (
      <div className="px-8 py-10">
        <EmptyState
          title="Your future is unwritten. Seal your first capsule."
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
    <div className="flex flex-col gap-8 px-8 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">
          {greeting()}, {user?.displayName}
        </h1>
      </header>

      {openingSoon.length > 0 ? (
        <section aria-label="Opening soon" className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-secondary">Opening soon</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {openingSoon.map((capsule) => (
              <CapsuleCard key={capsule.id} capsule={capsule} className="w-64 shrink-0" />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <select
              value={stateFilter ?? ''}
              onChange={(e) => setStateFilter((e.target.value || undefined) as CapsuleState | undefined)}
              className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent px-3 py-1.5 text-sm text-foreground"
            >
              {STATE_FILTERS.map((f) => (
                <option key={f.label} value={f.value ?? ''}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={typeFilter ?? ''}
              onChange={(e) => setTypeFilter((e.target.value || undefined) as CapsuleType | undefined)}
              className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All types</option>
              <option value="self">Self</option>
              <option value="personal">Someone else</option>
            </select>
          </div>
          <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 p-1">
            <button
              type="button"
              onClick={() => setView('timeline')}
              className={`rounded-[var(--radius-input)] px-3 py-1 text-sm ${view === 'timeline' ? 'bg-[var(--color-bg-raised)] text-foreground' : 'text-secondary'}`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`rounded-[var(--radius-input)] px-3 py-1 text-sm ${view === 'grid' ? 'bg-[var(--color-bg-raised)] text-foreground' : 'text-secondary'}`}
            >
              Grid
            </button>
          </div>
        </div>

        {capsules.length === 0 ? (
          <p className="py-8 text-center text-sm text-secondary">No capsules match these filters.</p>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capsules.map((capsule) => (
              <CapsuleCard key={capsule.id} capsule={capsule} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(([bucket, items]) => (
              <div key={bucket} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-secondary">{bucket}</h3>
                {items.map((capsule) => {
                  const unlockDate = resolveUnlockDate(capsule);
                  return (
                    <button
                      key={capsule.id}
                      type="button"
                      onClick={() => router.push(`/capsule/${capsule.id}`)}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/15 px-4 py-3 text-left hover:bg-[var(--color-bg-raised)]"
                    >
                      <span className="truncate text-sm text-foreground">{capsule.title || 'Untitled capsule'}</span>
                      <span className="flex shrink-0 items-center gap-3 text-sm text-secondary">
                        {capsule.state === 'sealed' && unlockDate ? <CountdownDisplay target={unlockDate} /> : capsule.state}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
