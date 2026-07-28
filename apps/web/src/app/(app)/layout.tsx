'use client';

import { Button, ThemeToggle } from '@tc/ui-web';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';

const NAV_ITEMS = [
  { href: '/home', label: 'Home' },
  { href: '/received', label: 'Received' },
  { href: '/people', label: 'People' },
];

/**
 * Left-sidebar shell per 02-UX-DESIGN.md §5.4's web layout. Home/Received/
 * People are real nav items now that T-16 built both pages —
 * Collections/Notifications/Settings still arrive with their own tickets
 * (T-17/18); adding dead links for pages that don't exist yet would
 * violate "don't build ahead of the ticket."
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

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
    </div>
  );
}
