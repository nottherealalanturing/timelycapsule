'use client';

import { Button, Dialog, EmptyState, Input, Skeleton } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { collectionsApi } from '../../../lib/api-client';

function coverStyle(cover: { kind: 'gradient' | 'image'; value: string } | null): React.CSSProperties {
  if (cover?.kind === 'gradient') return { background: cover.value };
  return { background: 'var(--color-bg-raised)' };
}

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
      <div className="flex flex-col gap-4 px-8 py-10">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">Collections</h1>
        <Button onClick={() => setCreateOpen(true)}>New collection</Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState title="No collections yet." action={<Button onClick={() => setCreateOpen(true)}>Create your first collection</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.id}`}
              className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 transition hover:shadow-md"
            >
              <div className="h-24 shrink-0" style={coverStyle(collection.cover)} />
              <div className="flex flex-col gap-1 p-4">
                <h3 className="truncate font-[var(--font-display)] text-base text-foreground">{collection.name}</h3>
                <p className="text-sm text-secondary">
                  {collection.capsuleCount} capsule{collection.capsuleCount === 1 ? '' : 's'}
                </p>
              </div>
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
