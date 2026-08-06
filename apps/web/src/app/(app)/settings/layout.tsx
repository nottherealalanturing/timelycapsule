'use client';

import { usePathname } from 'next/navigation';
import { Hallmark } from '@tc/ui-web';
import { NavLink } from '../../../components/NavLink';

const TABS = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/storage', label: 'Storage' },
  { href: '/settings/privacy', label: 'Privacy' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/data', label: 'Data' },
];

/**
 * Two-pane settings shell — nav left, panel right.
 *
 * Meridian V2 rebuild: shares `NavLink` with the app sidebar instead of
 * repeating the active-state markup, and the heading is a hallmark rather than
 * a display-serif title. Settings is an instrument, not a record.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    /*
      Two panes above `lg`, stacked below it. A second fixed 208px column
      inside an already-fixed 240px sidebar meant 448px of chrome before any
      content — on a phone that left nothing at all. Below `lg` the tabs
      become a scrolling row above the panel, which is the same information
      in the order it is actually read.
    */
    <div className="flex min-h-full flex-col lg:flex-row">
      <nav
        aria-label="Settings"
        className="flex shrink-0 flex-col gap-0.5 border-b border-[var(--color-rule)] px-5 py-6 lg:w-52 lg:border-b-0 lg:border-r lg:px-4 lg:py-10"
      >
        <h1 className="mb-3 px-2 lg:mb-4">
          <Hallmark>Settings</Hallmark>
        </h1>
        <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {TABS.map((tab) => (
            <NavLink
              key={tab.href}
              href={tab.href}
              label={tab.label}
              active={pathname === tab.href}
              className="shrink-0"
            />
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10">{children}</div>
    </div>
  );
}
