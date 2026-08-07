'use client';

import type { CapsuleListItem } from '@tc/contracts';
import { Button, EmptyState, Skeleton, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError, capsulesApi } from '../../../lib/api-client';
import { PageTitle, appFrame } from '../../../components/page-frame';
import { CapsuleRow } from '../../../components/capsule/CapsuleRow';

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function TrashRow({ capsule, onChanged }: { capsule: CapsuleListItem; onChanged: () => void }) {
  const { show } = useToast();
  const [confirmingPurge, setConfirmingPurge] = useState(false);

  const restoreMutation = useMutation({
    mutationFn: () => capsulesApi.restore(capsule.id),
    onSuccess: () => {
      show('Restored');
      onChanged();
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  const purgeMutation = useMutation({
    mutationFn: () => capsulesApi.purge(capsule.id),
    onSuccess: () => {
      show('Deleted forever');
      onChanged();
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  // The same capsule as everywhere else — Trash adds what is true only here
  // (how long it has been gone, and how long is left) rather than drawing its
  // own third version of the object.
  return (
    <CapsuleRow
      capsule={capsule}
      trailing={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[length:var(--text-caption)] text-secondary">
            {capsule.trashedAt ? `Deleted ${daysAgo(capsule.trashedAt)} days ago` : null}
            {capsule.purgeAfter ? ` · purges in ${daysUntil(capsule.purgeAfter)} days` : null}
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="secondary" loading={restoreMutation.isPending} onClick={() => restoreMutation.mutate()}>
              Restore
            </Button>
            {confirmingPurge ? (
              <>
                <Button size="sm" variant="destructive" loading={purgeMutation.isPending} onClick={() => purgeMutation.mutate()}>
                  Confirm delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingPurge(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmingPurge(true)}>
                Delete forever
              </Button>
            )}
          </span>
        </div>
      }
    />
  );
}

/** Trash view per 02-UX-DESIGN.md §5.10: rows with a purge countdown, Restore/Delete forever, and a double-confirmed Empty trash. */
export default function TrashPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [emptyStep, setEmptyStep] = useState(0);
  const [emptying, setEmptying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['capsules', 'trashed'],
    queryFn: () => capsulesApi.list({ view: 'trashed', limit: 100 }),
  });
  const capsules = data?.data ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['capsules', 'trashed'] });
  }

  async function emptyTrash() {
    setEmptying(true);
    try {
      await Promise.all(capsules.map((c) => capsulesApi.purge(c.id)));
      show('Trash emptied');
      setEmptyStep(0);
      await refresh();
    } catch (err) {
      show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' });
    } finally {
      setEmptying(false);
    }
  }

  if (isLoading) {
    return (
      <div className={appFrame('flex flex-col gap-4')}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  return (
    <div className={appFrame('flex flex-col gap-6')}>
      <div className="flex items-center justify-between">
        <PageTitle>Trash</PageTitle>
        {capsules.length > 0 ? (
          emptyStep === 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setEmptyStep(1)}>
              Empty trash
            </Button>
          ) : emptyStep === 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-secondary">Permanently delete everything in trash?</span>
              <Button variant="destructive" size="sm" onClick={() => setEmptyStep(2)}>
                Yes, continue
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEmptyStep(0)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-secondary">This can’t be undone. Are you sure?</span>
              <Button variant="destructive" size="sm" loading={emptying} onClick={() => void emptyTrash()}>
                Delete everything
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEmptyStep(0)}>
                Cancel
              </Button>
            </div>
          )
        ) : null}
      </div>

      {capsules.length === 0 ? (
        <EmptyState title="Trash is empty." />
      ) : (
        <div className="flex flex-col gap-2">
          {capsules.map((capsule) => (
            <TrashRow key={capsule.id} capsule={capsule} onChanged={() => void refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}
