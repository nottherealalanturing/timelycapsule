'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppSidebar } from '../../components/AppSidebar';
import { CommandPalette } from '../../components/CommandPalette';
import { useAuth } from '../../lib/auth-context';

/**
 * Protected application shell.
 *
 * Meridian V2 rebuild: the sidebar's markup moved to `AppSidebar` so it can be
 * exercised and captured without a live session. **The guard below is
 * unchanged** — it is auth business logic, not presentation.
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
      <AppSidebar
        displayName={user.displayName}
        pathname={pathname}
        onSearch={() => setPaletteOpen(true)}
        onLogout={() => void logout()}
      />
      <main className="min-w-0 flex-1">{children}</main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
