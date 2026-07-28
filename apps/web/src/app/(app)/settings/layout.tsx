'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/storage', label: 'Storage' },
  { href: '/settings/privacy', label: 'Privacy' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/data', label: 'Data' },
];

/** Two-pane settings shell per 02-UX-DESIGN.md §5.13 — nav left, panel right. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full">
      <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-[var(--color-text-secondary)]/15 px-4 py-10">
        <h1 className="mb-4 px-2 font-[var(--font-display)] text-lg text-foreground">Settings</h1>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-[var(--radius-input)] px-3 py-2 text-sm ${
              pathname === tab.href ? 'bg-[var(--color-bg-raised)] font-medium text-foreground' : 'text-secondary hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 px-8 py-10">{children}</div>
    </div>
  );
}
