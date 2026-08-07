'use client';

import type { SearchResultItem } from '@tc/contracts';
import { Hallmark } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchApi } from '../lib/api-client';

interface ActionItem {
  kind: 'action';
  id: string;
  label: string;
  href: string;
}

const ACTIONS: ActionItem[] = [{ kind: 'action', id: 'new-capsule', label: 'New capsule', href: '/capsule/new' }];

/** Why this result is here. Stated, because a match on a tag is not a match on a name. */
const MATCHED_ON: Record<'title' | 'tag' | 'recipient', string> = {
  title: '',
  tag: 'matched a tag',
  recipient: 'matched a recipient',
};

const STATE_LABEL: Record<string, string> = {
  draft: 'Not yet sealed',
  sealing: 'Sealing',
  sealed: 'Sealed',
  unlocked: 'Opened',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5">
      <span className="px-2 pb-1">
        <Hallmark>{label}</Hallmark>
      </span>
      {children}
    </div>
  );
}

function Row({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="motion-instant flex w-full items-baseline justify-between gap-4 rounded-[var(--radius-input)] px-2 py-2 text-left hover:bg-[var(--color-bg-base)]"
    >
      {children}
    </button>
  );
}

/**
 * ⌘K — the only search in the product.
 *
 * There used to be two: this palette, and a `/search` page it linked to via
 * "See all results", with its own input, its own grouping and its own idea of
 * how a capsule reads. Two searches over one index is a duplicated
 * interaction, and the page was the weaker of them — it could not be reached
 * without first opening the palette or typing the URL, and the sidebar's
 * "Search" button opened the palette anyway.
 *
 * Capsules are named here the way they are named everywhere else: the hallmark
 * above, the title or — for the untitled capsule, which is the normal case —
 * what it is, rather than the `Untitled capsule` placeholder M2 removed.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const setOpen = onOpenChange;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  // Which query the current results belong to, so a stale response can never
  // be read as an answer to a newer question — and “Nothing matches” is only
  // shown once results for *this* query have actually arrived.
  const [resultsFor, setResultsFor] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the query/results on every open, without a setState-in-effect:
  // "adjusting state during render" (React's own escape hatch) instead of
  // an effect that would fire an extra render pass just to clear state.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setResults([]);
      setResultsFor('');
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  // Autofocus is a real DOM side effect (not React state), so this one stays an effect.
  useEffect(() => {
    if (open) {
      const handle = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(handle);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || !q) return;
    const handle = setTimeout(() => {
      void searchApi.query(q).then((res) => {
        setResults(res.data);
        setResultsFor(q);
      });
    }, 150);
    return () => clearTimeout(handle);
  }, [open, query]);

  if (!open) return null;

  const trimmedQuery = query.trim();
  const displayedResults = trimmedQuery ? results : [];
  const capsules = displayedResults.filter((r) => r.kind === 'capsule');
  const people = displayedResults.filter((r) => r.kind === 'person');
  const collections = displayedResults.filter((r) => r.kind === 'collection');
  const actions = ACTIONS.filter((a) => !trimmedQuery || a.label.toLowerCase().includes(trimmedQuery.toLowerCase()));
  const nothing = trimmedQuery === resultsFor && trimmedQuery !== '' && displayedResults.length === 0 && actions.length === 0;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-20 sm:pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="w-full max-w-lg rounded-[var(--radius-modal)] bg-[var(--color-bg-raised)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search capsules, people, collections…"
          className="w-full border-b border-[var(--color-rule)] bg-transparent px-4 py-3 text-[length:var(--text-body-s)] text-foreground outline-none placeholder:text-secondary"
        />

        <div className="max-h-96 overflow-y-auto py-1.5">
          {!trimmedQuery ? (
            <p className="px-4 py-6 text-[length:var(--text-body-s)] text-secondary">
              Titles, tags and recipients. What a capsule says is encrypted, so it is never searched.
            </p>
          ) : null}

          {nothing ? (
            <p className="px-4 py-6 text-[length:var(--text-body-s)] text-secondary">
              Nothing matches “{trimmedQuery}”.
            </p>
          ) : null}

          {capsules.length > 0 ? (
            <Group label="Capsules">
              {capsules.map((r) => (
                <Row key={r.id} onSelect={() => go(`/capsule/${r.id}`)}>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Hallmark>{r.publicId}</Hallmark>
                    <span
                      className={`truncate text-[length:var(--text-body-s)] ${
                        r.title ? 'text-foreground' : 'text-secondary'
                      }`}
                    >
                      {r.title || (r.type === 'self' ? 'For yourself' : 'For someone else')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[length:var(--text-caption)] text-secondary">
                    {MATCHED_ON[r.matchedOn] || STATE_LABEL[r.state] || r.state}
                  </span>
                </Row>
              ))}
            </Group>
          ) : null}

          {people.length > 0 ? (
            <Group label="People">
              {people.map((r) => (
                <Row key={r.id} onSelect={() => go('/people')}>
                  <span className="truncate text-[length:var(--text-body-s)] text-foreground">{r.name}</span>
                  {r.email ? (
                    <span className="shrink-0 text-[length:var(--text-caption)] text-secondary">{r.email}</span>
                  ) : null}
                </Row>
              ))}
            </Group>
          ) : null}

          {collections.length > 0 ? (
            <Group label="Collections">
              {collections.map((r) => (
                <Row key={r.id} onSelect={() => go(`/collections/${r.id}`)}>
                  <span className="truncate text-[length:var(--text-body-s)] text-foreground">{r.name}</span>
                </Row>
              ))}
            </Group>
          ) : null}

          {actions.length > 0 ? (
            <Group label="Actions">
              {actions.map((a) => (
                <Row key={a.id} onSelect={() => go(a.href)}>
                  <span className="text-[length:var(--text-body-s)] text-foreground">{a.label}</span>
                </Row>
              ))}
            </Group>
          ) : null}
        </div>
      </div>
    </div>
  );
}
