'use client';

import { ThemeToggle } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';

/**
 * Protected shell for the signed-in app. Full sidebar/nav per
 * 02-UX-DESIGN.md §5.4 lands in T-12 — this just gates access and provides
 * a stable layout for /home's empty state (T-06 DoD).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

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
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--color-text-secondary)]/15 px-6 py-4">
        <span className="font-[var(--font-display)] text-lg text-foreground">TimelyCapsule</span>
        <ThemeToggle />
      </header>
      <main>{children}</main>
    </div>
  );
}
