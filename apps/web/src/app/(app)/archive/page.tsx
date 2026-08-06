'use client';

import { EmptyState, Skeleton } from '@tc/ui-web';
import { useQuery } from '@tanstack/react-query';
import { CapsuleRow } from '../../../components/capsule/CapsuleRow';
import { capsulesApi } from '../../../lib/api-client';
import { PageTitle, appFrame } from '../../../components/page-frame';

/** Archive view per 02-UX-DESIGN.md §5.10 — the same capsule representation every other surface uses. */
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
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-6')}>
      <PageTitle>Archive</PageTitle>
      {capsules.length === 0 ? (
        <EmptyState title="Nothing archived yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {capsules.map((capsule) => (
            <CapsuleRow key={capsule.id} capsule={capsule} />
          ))}
        </div>
      )}
    </div>
  );
}
