'use client';

import type { SearchResultItem } from '@tc/contracts';
import { EmptyState, Input } from '@tc/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { searchApi } from '../../../lib/api-client';
import { PageTitle, appFrame } from '../../../components/page-frame';

const GROUP_LABEL: Record<SearchResultItem['kind'], string> = {
  capsule: 'Capsules',
  person: 'People',
  collection: 'Collections',
};

function href(item: SearchResultItem): string {
  if (item.kind === 'capsule') return `/capsule/${item.id}`;
  if (item.kind === 'collection') return `/collections/${item.id}`;
  return '/people';
}

function label(item: SearchResultItem): string {
  if (item.kind === 'capsule') return item.title || 'Untitled capsule';
  return item.name;
}

/** Full search page per 02-UX-DESIGN.md §5.11 — query narrows a titles/tags/recipients index (never content). */
function SearchPageInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const { data, isFetching } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchApi.query(query.trim()),
    enabled: query.trim().length > 0,
  });
  const results = data?.data ?? [];
  const groups = (['capsule', 'person', 'collection'] as const).map((kind) => ({
    kind,
    items: results.filter((r) => r.kind === kind),
  }));

  return (
    <div className={appFrame('flex flex-col gap-6')}>
      <PageTitle>Search</PageTitle>
      <Input
        label="Search capsules, people, collections"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {!query.trim() ? (
        <EmptyState title="Sealed capsules keep their secrets until they open." />
      ) : !isFetching && results.length === 0 ? (
        <EmptyState title="No results." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ kind, items }) =>
            items.length > 0 ? (
              <section key={kind} className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-secondary">{GROUP_LABEL[kind]}</h2>
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={href(item)}
                      className="rounded-[var(--radius-card)] border border-[var(--color-rule)] px-4 py-3 text-sm text-foreground hover:bg-[var(--color-bg-raised)]"
                    >
                      {label(item)}
                      {item.kind === 'capsule' ? <span className="ml-2 text-secondary">matched on {item.matchedOn}</span> : null}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
