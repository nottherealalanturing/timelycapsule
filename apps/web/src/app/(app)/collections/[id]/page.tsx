'use client';

import { Button, EmptyState, Skeleton, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { CapsuleCard } from '../../../../components/CapsuleCard';
import { ApiClientError, capsulesApi, collectionsApi } from '../../../../lib/api-client';

/**
 * Collection detail = filtered timeline (02-UX-DESIGN.md §5.10). Reorder
 * uses up/down buttons rather than drag handles — same call as T-11's
 * media reorder, for the same reason (simpler, no drag library needed).
 */
export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();

  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionsApi.list(),
  });
  const collection = collectionsData?.data.find((c) => c.id === id);

  const { data, isLoading } = useQuery({
    queryKey: ['capsules', 'collection', id],
    queryFn: () => capsulesApi.list({ collectionId: id, limit: 100 }),
  });
  const capsules = data?.data ?? [];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['capsules', 'collection', id] }),
      queryClient.invalidateQueries({ queryKey: ['collections'] }),
    ]);
  }

  const removeMutation = useMutation({
    mutationFn: (capsuleId: string) => collectionsApi.removeItem(id, capsuleId),
    onSuccess: () => void refresh(),
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  const reorderMutation = useMutation({
    mutationFn: (capsuleIds: string[]) => collectionsApi.reorderItems(id, { capsuleIds }),
    onSuccess: () => void refresh(),
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => collectionsApi.delete(id),
    onSuccess: () => {
      show('Collection deleted — capsules were kept');
      router.push('/collections');
    },
  });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= capsules.length) return;
    const ids = capsules.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorderMutation.mutate(ids);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 px-8 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">{collection?.name ?? 'Collection'}</h1>
        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate()}>
          Delete collection
        </Button>
      </div>

      {capsules.length === 0 ? (
        <EmptyState title="No capsules in this collection yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {capsules.map((capsule, index) => (
            <div key={capsule.id} className="flex items-center gap-3">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="text-secondary disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === capsules.length - 1}
                  onClick={() => move(index, 1)}
                  className="text-secondary disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <CapsuleCard capsule={capsule} className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => removeMutation.mutate(capsule.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
