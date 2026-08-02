'use client';

import { Button, Hallmark, Lockup, ThemeToggle } from '@tc/ui-web';
import Link from 'next/link';
import { NavLink } from './NavLink';

const NAV_ITEMS = [
  { href: '/home', label: 'Home' },
  { href: '/received', label: 'Received' },
  { href: '/people', label: 'People' },
  { href: '/collections', label: 'Collections' },
  { href: '/archive', label: 'Archive' },
  { href: '/trash', label: 'Trash' },
];

export interface AppSidebarProps {
  displayName: string;
  pathname: string;
  onSearch: () => void;
  onLogout: () => void;
}

/**
 * The application shell's navigation.
 *
 * Extracted from `(app)/layout.tsx` during the Meridian V2 rebuild so it is
 * presentational and can be exercised without a live session — the layout it
 * came from is auth-gated, which made it impossible to verify or capture. The
 * layout keeps the guard; this keeps the chrome.
 */
export function AppSidebar({ displayName, pathname, onSearch, onLogout }: AppSidebarProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-7 border-r border-[var(--color-rule)] px-4 py-7">
      <Link
        href="/home"
        className="motion-instant rounded-[var(--radius-input)] px-2 py-1 opacity-90 hover:opacity-100"
      >
        <Lockup size={22} />
      </Link>

      <Link href="/capsule/new">
        <Button fullWidth>New capsule</Button>
      </Link>

      <button
        type="button"
        onClick={onSearch}
        className="motion-instant flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 text-[length:var(--text-body-s)] text-secondary hover:border-[var(--color-rule-strong)] hover:text-foreground"
      >
        Search
        <Hallmark>⌘K</Hallmark>
      </button>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-[var(--color-rule)] pt-4">
        <NavLink href="/settings" label="Settings" active={pathname.startsWith('/settings')} />
        <div className="flex items-center justify-between gap-2 px-2">
          <span className="truncate text-[length:var(--text-body-s)] text-secondary">{displayName}</span>
          <ThemeToggle />
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout} className="justify-start">
          Log out
        </Button>
      </div>
    </aside>
  );
}
