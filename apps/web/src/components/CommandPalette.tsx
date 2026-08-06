'use client';

import type { SearchResultItem } from '@tc/contracts';
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

/**
 * Linear-style ⌘K palette per 02-UX-DESIGN.md §5.11 — instant results
 * grouped Capsules/People/Collections/Actions, doubling as nav. Controlled
 * from `(app)/layout.tsx` so the sidebar's "Search" button can open it too,
 * not just the global `⌘K`/`Ctrl+K` shortcut registered here.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const setOpen = onOpenChange;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
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
    if (!open || !query.trim()) return;
    const handle = setTimeout(() => {
      void searchApi.query(query.trim()).then((res) => setResults(res.data));
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

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg rounded-[var(--radius-modal)] bg-[var(--color-bg-raised)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search capsules, people, collections…"
          className="w-full border-b border-[var(--color-rule)] bg-transparent px-4 py-3 text-sm text-foreground outline-none"
        />

        <div className="max-h-96 overflow-y-auto py-2">
          {!query.trim() && actions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-secondary">Start typing to search.</p>
          ) : null}

          {capsules.length > 0 ? (
            <div className="px-2 py-1">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-secondary">Capsules</p>
              {capsules.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => go(`/capsule/${r.id}`)}
                  className="block w-full rounded-[var(--radius-input)] px-2 py-2 text-left text-sm text-foreground hover:bg-[var(--color-bg-base)]"
                >
                  {r.title || 'Untitled capsule'}
                </button>
              ))}
            </div>
          ) : null}

          {people.length > 0 ? (
            <div className="px-2 py-1">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-secondary">People</p>
              {people.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => go('/people')}
                  className="block w-full rounded-[var(--radius-input)] px-2 py-2 text-left text-sm text-foreground hover:bg-[var(--color-bg-base)]"
                >
                  {r.name}
                </button>
              ))}
            </div>
          ) : null}

          {collections.length > 0 ? (
            <div className="px-2 py-1">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-secondary">Collections</p>
              {collections.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => go(`/collections/${r.id}`)}
                  className="block w-full rounded-[var(--radius-input)] px-2 py-2 text-left text-sm text-foreground hover:bg-[var(--color-bg-base)]"
                >
                  {r.name}
                </button>
              ))}
            </div>
          ) : null}

          {actions.length > 0 ? (
            <div className="px-2 py-1">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-secondary">Actions</p>
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => go(a.href)}
                  className="block w-full rounded-[var(--radius-input)] px-2 py-2 text-left text-sm text-foreground hover:bg-[var(--color-bg-base)]"
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}

          {query.trim() ? (
            <button
              type="button"
              onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
              className="mt-1 block w-full border-t border-[var(--color-rule)] px-4 py-2 text-left text-sm text-secondary hover:text-foreground"
            >
              See all results for “{query.trim()}”
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
