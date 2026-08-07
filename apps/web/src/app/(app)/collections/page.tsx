'use client';

import { Button, Dialog, EmptyState, Hallmark, Input, Skeleton } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { collectionsApi } from '../../../lib/api-client';
import { PageTitle, appFrame } from '../../../components/page-frame';

/** Collections grid per 02-UX-DESIGN.md §5.10 — create/rename/delete here, detail view is a filtered timeline. */
export default function CollectionsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionsApi.list(),
  });
  const collections = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => collectionsApi.create({ name: name.trim() }),
    onSuccess: () => {
      setCreateOpen(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

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
      <div className="flex items-center justify-between">
        <PageTitle>Collections</PageTitle>
        <Button onClick={() => setCreateOpen(true)}>New collection</Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState title="No collections yet." action={<Button onClick={() => setCreateOpen(true)}>Create your first collection</Button>} />
      ) : (
        /*
          A list in the same grammar as every other list behind the login,
          not a grid of picture cards. The 96px cover band each card wore was
          the last of the decorative gradients — the same ornament cut from
          the capsule card and the capsule detail page, surviving here only
          because nothing had been through this surface yet. Empty of any
          gradient it was simply a grey rectangle above every name.

          What replaces it is what a collection actually is: a name, and how
          much is in it — stated in the reading slot the capsule rows use, so
          a shelf and the documents on it are described the same way.
        */
        <div className="flex flex-col gap-2">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.id}`}
              className="motion-instant flex items-center justify-between gap-4 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-4 py-3 hover:border-[var(--color-rule-strong)]"
            >
              <span className="truncate text-[length:var(--text-body)] text-foreground">{collection.name}</span>
              <span className="flex shrink-0 flex-col gap-0.5 text-right">
                <Hallmark>Holding</Hallmark>
                <span className="text-[length:var(--text-body-s)] text-secondary">
                  {collection.capsuleCount === 0
                    ? 'Nothing yet'
                    : `${collection.capsuleCount} capsule${collection.capsuleCount === 1 ? '' : 's'}`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="New collection" width="sm">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={createMutation.isPending} disabled={!name.trim()}>
            Create
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
