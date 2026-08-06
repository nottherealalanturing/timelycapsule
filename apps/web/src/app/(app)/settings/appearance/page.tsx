'use client';

import { ThemeToggle } from '@tc/ui-web';

export default function AppearanceSettingsPage() {
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h2 className="font-[var(--font-display)] text-lg text-foreground">Appearance</h2>
      <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-rule)] px-4 py-3">
        <span className="text-sm text-foreground">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
