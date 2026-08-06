'use client';

import { Button, Hallmark, Lockup, ThemeToggle, cn } from '@tc/ui-web';
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
  /** Drawer state. Ignored at `lg` and above, where the column is permanent. */
  open?: boolean;
  onClose?: () => void;
}

/**
 * The application shell's navigation.
 *
 * **A permanent column above `lg`, a dismissible drawer below it.** It used to
 * be a fixed 240px at every width, which on a 375px phone took 64% of the
 * viewport and left ~135px for the page — timeline rows overlapped their own
 * readings and cards clipped mid-word. The composer and the reveal were
 * already responsive; the surface people actually live in was not.
 *
 * The breakpoint is `lg` rather than `md` because the sidebar and a dashboard
 * row both need real width: at 768px the column plus a bounded page left the
 * row too narrow to hold a title and a Dual Clock on one line.
 */
export function AppSidebar({ displayName, pathname, onSearch, onLogout, open = false, onClose }: AppSidebarProps) {
  return (
    <>
      {/* Scrim. Below `lg` only — above it the column is part of the layout
          and there is nothing to dismiss. */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-[var(--color-bg-primary)]/70 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'flex w-60 shrink-0 flex-col gap-7 border-r border-[var(--color-rule)] bg-[var(--color-bg-primary)] px-4 py-7',
          // Off-canvas by default, in-flow from `lg`. `motion-instant` because
          // navigation is reversible and belongs to the instant tier
          // (`07 §VI`) — a drawer that eases in is a drawer that reads as
          // ceremony, and ceremony is reserved.
          'motion-instant fixed inset-y-0 left-0 z-40 overflow-y-auto lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <Link
          href="/home"
          onClick={onClose}
          className="motion-instant rounded-[var(--radius-input)] px-2 py-1 opacity-90 hover:opacity-100"
        >
          <Lockup size={22} />
        </Link>

        <Link href="/capsule/new" onClick={onClose}>
          <Button fullWidth>New capsule</Button>
        </Link>

        <button
          type="button"
          onClick={() => {
            onClose?.();
            onSearch();
          }}
          className="motion-instant flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 text-[length:var(--text-body-s)] text-secondary hover:border-[var(--color-rule-strong)] hover:text-foreground"
        >
          Search
          <Hallmark>⌘K</Hallmark>
        </button>

        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={pathname === item.href}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-[var(--color-rule)] pt-4">
          <NavLink
            href="/settings"
            label="Settings"
            active={pathname.startsWith('/settings')}
            onNavigate={onClose}
          />
          <div className="flex items-center justify-between gap-2 px-2">
            <span className="truncate text-[length:var(--text-body-s)] text-secondary">{displayName}</span>
            <ThemeToggle />
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="justify-start">
            Log out
          </Button>
        </div>
      </aside>
    </>
  );
}
