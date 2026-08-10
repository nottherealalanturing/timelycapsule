'use client';

import { Button, Input, useToast } from '@tc/ui-web';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiClientError, authApi, settingsApi } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
];

function AvatarUploader() {
  const { user, refreshUser } = useAuth();
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const contentType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
      const { uploadUrl, avatarKey } = await settingsApi.createAvatarUpload({ contentType });
      const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      // A rejected presigned PUT (bad/expired signature, a bucket CORS
      // policy that blocks the request) still resolves rather than
      // throwing — without this check, `patchMe` below would point the
      // account at an avatarKey that was never actually written to R2.
      if (!res.ok) {
        throw new Error(`Avatar upload failed: ${res.status} ${res.statusText}`);
      }
      await authApi.patchMe({ avatarKey });
    },
    onSuccess: async () => {
      await refreshUser();
      show('Avatar updated');
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Could not upload avatar', { variant: 'danger' }),
  });

  return (
    <div className="flex items-center gap-4">
      <div
        aria-hidden
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-raised)] text-lg font-medium text-foreground"
      >
        {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
        }}
      />
      <Button variant="secondary" size="sm" loading={uploadMutation.isPending} onClick={() => fileRef.current?.click()}>
        Upload avatar
      </Button>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const { user, refreshUser } = useAuth();
  const { show } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [locale, setLocale] = useState(user?.locale ?? 'en');

  const saveMutation = useMutation({
    mutationFn: () => authApi.patchMe({ displayName, timezone, locale }),
    onSuccess: async () => {
      await refreshUser();
      show('Profile saved');
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  function detectTimezone() {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h2 className="font-[var(--font-display)] text-lg text-foreground">Profile</h2>

      <AvatarUploader />

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Timezone</label>
          <div className="flex gap-2">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex-1 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-sm text-foreground"
            >
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" size="sm" onClick={detectTimezone}>
              Auto-detect
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Locale</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-sm text-foreground"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" loading={saveMutation.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}
