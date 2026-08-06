'use client';

import { EmptyState, Skeleton } from '@tc/ui-web';
import { useQuery } from '@tanstack/react-query';
import { CapsuleCard } from '../../../components/CapsuleCard';
import { capsulesApi } from '../../../lib/api-client';
import { PageTitle, appFrame } from '../../../components/page-frame';

/** Archive view per 02-UX-DESIGN.md §5.10 — a filtered timeline, same grid CapsuleCard uses elsewhere. */
export default function ArchivePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['capsules', 'archived'],
    queryFn: () => capsulesApi.list({ view: 'archived', limit: 100 }),
  });
  const capsules = data?.data ?? [];

  if (isLoading) {
    return (
      <div className={appFrame('flex flex-col gap-4')}>
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-6')}>
      <PageTitle>Archive</PageTitle>
      {capsules.length === 0 ? (
        <EmptyState title="Nothing archived yet." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capsules.map((capsule) => (
            <CapsuleCard key={capsule.id} capsule={capsule} />
          ))}
        </div>
      )}
    </div>
  );
}
