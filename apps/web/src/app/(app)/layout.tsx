'use client';

import { Lockup } from '@tc/ui-web';
import Link from 'next/link';
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
  const [navOpen, setNavOpen] = useState(false);

  // The drawer is a view of the current route, so it closes when the route
  // changes — including on a back/forward gesture, which no click handler on
  // a link would catch. Adjusted during render rather than in an effect,
  // which is React's own escape hatch and the idiom `CommandPalette` already
  // uses to reset itself; an effect would both trip `set-state-in-effect` and
  // paint one frame with the drawer still open over the new page.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setNavOpen(false);
  }

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
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Below `lg` the sidebar is off-canvas, so the lockup and the way back
          to it go here. A rule rather than a raised bar: the shell is
          instrument, and a filled header would be one more lit surface
          competing with the page.
        */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-bg-primary)]/95 px-5 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            className="motion-instant rounded-[var(--radius-input)] border border-[var(--color-rule)] px-2.5 py-1.5 text-[length:var(--text-body-s)] text-secondary hover:border-[var(--color-rule-strong)] hover:text-foreground"
          >
            {/* Three rules, not a hamburger glyph from an icon font — the
                same hairline vocabulary the instrument uses everywhere else. */}
            <span aria-hidden className="flex w-4 flex-col gap-[3px]">
              <span className="h-px w-full bg-current" />
              <span className="h-px w-full bg-current" />
              <span className="h-px w-full bg-current" />
            </span>
          </button>
          <Link href="/home" className="motion-instant opacity-90 hover:opacity-100">
            <Lockup size={20} />
          </Link>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
