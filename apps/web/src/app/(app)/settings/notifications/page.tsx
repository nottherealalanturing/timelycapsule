'use client';

import type { NotificationCategory } from '@tc/contracts';
import { Button, Checkbox, Skeleton, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError, notificationPrefsApi } from '../../../../lib/api-client';

type EmailToggleCategory = Exclude<NotificationCategory, 'security'>;

const CATEGORIES: { value: EmailToggleCategory; label: string }[] = [
  { value: 'unlock', label: 'Capsule unlocks' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'delivery', label: 'Delivery issues' },
  { value: 'social', label: 'Reactions & activity' },
  { value: 'billing', label: 'Billing' },
  { value: 'product', label: 'Product updates' },
  { value: 'digest', label: 'Digests' },
];

/**
 * Category × channel matrix (02-UX-DESIGN.md §5.13) — email is the only
 * channel that actually exists today (push is T-26/mobile, SMS is never
 * built per the plan), so this renders one email toggle per category
 * rather than a multi-column matrix with columns that would do nothing.
 * `security` is deliberately absent — non-optional by design (03-ARCHITECTURE.md §11).
 */
export default function NotificationsSettingsPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['notification-prefs'], queryFn: () => notificationPrefsApi.get() });
  const prefs = data?.prefs;
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');

  const start = quietStart || prefs?.quietHours?.start || '';
  const end = quietEnd || prefs?.quietHours?.end || '';

  const mutation = useMutation({
    mutationFn: (input: { emailOptOut: EmailToggleCategory[]; quietHours: { start: string; end: string } | null }) =>
      notificationPrefsApi.put(input),
    onSuccess: (res) => {
      queryClient.setQueryData(['notification-prefs'], res);
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  function toggleCategory(category: EmailToggleCategory) {
    if (!prefs) return;
    const optedOut = prefs.emailOptOut.includes(category);
    const next = optedOut ? prefs.emailOptOut.filter((c) => c !== category) : [...prefs.emailOptOut, category];
    mutation.mutate({ emailOptOut: next, quietHours: prefs.quietHours });
  }

  function saveQuietHours() {
    if (!prefs) return;
    mutation.mutate({ emailOptOut: prefs.emailOptOut, quietHours: start && end ? { start, end } : null });
  }

  if (isLoading || !prefs) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)] text-foreground">Notifications</h2>
        {/*
          The shared `Checkbox`, not a bare `<input type="checkbox">`. Its own
          docstring names this exact failure: a native checkbox "renders in the
          browser's own accent colour and ignores the design system entirely".
          Seven of them sat in Settings doing precisely that, in the browser's
          blue, next to controls that had all been deliberately drawn.
        */}
        <div className="flex flex-col gap-2.5">
          {CATEGORIES.map((category) => (
            <Checkbox
              key={category.value}
              label={category.label}
              checked={!prefs.emailOptOut.includes(category.value)}
              onChange={() => toggleCategory(category.value)}
            />
          ))}
          <Checkbox label="Security alerts — always on" checked disabled onChange={() => {}} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)] text-foreground">Quiet hours</h2>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={start}
            onChange={(e) => setQuietStart(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
          />
          <span className="text-secondary">to</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setQuietEnd(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
          />
          <Button size="sm" variant="secondary" onClick={saveQuietHours}>
            Save
          </Button>
        </div>
      </section>
    </div>
  );
}
