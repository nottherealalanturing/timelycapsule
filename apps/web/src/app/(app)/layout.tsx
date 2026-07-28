'use client';

import { Button, ThemeToggle } from '@tc/ui-web';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CommandPalette } from '../../components/CommandPalette';
import { useAuth } from '../../lib/auth-context';

const NAV_ITEMS = [
  { href: '/home', label: 'Home' },
  { href: '/received', label: 'Received' },
  { href: '/people', label: 'People' },
  { href: '/collections', label: 'Collections' },
  { href: '/archive', label: 'Archive' },
  { href: '/trash', label: 'Trash' },
];

/**
 * Left-sidebar shell per 02-UX-DESIGN.md §5.4's web layout. Home/Received/
 * People/Collections/Archive/Trash are real nav items now that T-16/T-17
 * built them — Notifications/Settings still arrive with their own ticket
 * (T-18); adding dead links for pages that don't exist yet would violate
 * "don't build ahead of the ticket."
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    } else if (!loading && user && !user.emailVerifiedAt) {
      router.replace('/verify');
    }
  }, [loading, user, router]);

  if (loading || !user || !user.emailVerifiedAt) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-[var(--color-text-secondary)]/15 px-4 py-6">
        <Link href="/home" className="px-2 font-[var(--font-display)] text-lg text-foreground">
          TimelyCapsule
        </Link>

        <Link href="/capsule/new">
          <Button fullWidth>New Capsule</Button>
        </Link>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 px-3 py-2 text-sm text-secondary hover:text-foreground"
        >
          Search
          <span className="text-xs">⌘K</span>
        </button>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[var(--radius-input)] px-3 py-2 text-sm ${
                pathname === item.href ? 'bg-[var(--color-bg-raised)] font-medium text-foreground' : 'text-secondary hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-center justify-between px-2">
            <span className="truncate text-sm text-secondary">{user.displayName}</span>
            <ThemeToggle />
          </div>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
