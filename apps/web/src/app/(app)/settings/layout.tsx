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
    <div className="flex min-h-full">
      <nav
        aria-label="Settings"
        className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-[var(--color-rule)] px-4 py-10"
      >
        <h1 className="mb-4 px-2">
          <Hallmark>Settings</Hallmark>
        </h1>
        {TABS.map((tab) => (
          <NavLink key={tab.href} href={tab.href} label={tab.label} active={pathname === tab.href} />
        ))}
      </nav>
      <div className="min-w-0 flex-1 px-8 py-10">{children}</div>
    </div>
  );
}
