'use client';

import {
  formatRecoveryCode,
  generateMasterKey,
  generateRecoveryCode,
  unwrapMasterKeyWithPassword,
  wrapMasterKeyWithPassword,
  wrapMasterKeyWithRecoveryCode,
} from '@tc/crypto';
import { Button, Input, OtpInput, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError, authApi, sessionsApi } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';

function SessionsList() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data } = useQuery({ queryKey: ['sessions'], queryFn: () => sessionsApi.list() });
  const sessions = data?.data ?? [];

  const revokeMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.revoke(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sessions'] }),
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => (
        <div key={session.id} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-rule)] p-3">
          <div>
            <p className="text-sm text-foreground">
              {session.deviceName ?? session.platform} {session.current ? <span className="text-secondary">(this device)</span> : null}
            </p>
            <p className="text-sm text-secondary">
              {session.ip ?? 'Unknown location'} · last used {session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString() : 'never'}
            </p>
          </div>
          {!session.current ? (
            <Button size="sm" variant="ghost" onClick={() => revokeMutation.mutate(session.id)}>
              Revoke
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PasswordChangeForm() {
  const { user } = useAuth();
  const { show } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.masterKeyWrap) throw new Error('No encryption key on this account yet.');
      const masterKey = await unwrapMasterKeyWithPassword(user.masterKeyWrap, currentPassword);
      const masterKeyWrap = await wrapMasterKeyWithPassword(masterKey, newPassword);
      await authApi.changePassword({ currentPassword, newPassword, masterKeyWrap });
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setError(null);
      show('Password changed. Other devices were signed out.');
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Current password is incorrect'),
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <Button type="submit" loading={mutation.isPending} disabled={!currentPassword || !newPassword}>
        Change password
      </Button>
    </form>
  );
}

/**
 * Google-only accounts have no passwordHash/masterKeyWrap yet (nothing to
 * derive a key from at signup) — PasswordChangeForm below requires an
 * existing password to re-wrap from, which doesn't apply here. This is the
 * Settings-page counterpart to MasterKeyGate's same first-password flow.
 */
function SetInitialPasswordForm() {
  const { setUser } = useAuth();
  const [password, setPassword] = useState('');
  // Holds the server's updated user record between success and
  // acknowledgement — see the note on `savedConfirmed`'s Done handler below
  // for why this isn't just passed straight to `setUser`.
  const [pendingUser, setPendingUser] = useState<Parameters<typeof setUser>[0]>(null);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const key = generateMasterKey();
      const masterKeyWrap = await wrapMasterKeyWithPassword(key, password);
      const recoveryCodeBytes = generateRecoveryCode();
      const recoveryKeyWrap = await wrapMasterKeyWithRecoveryCode(key, recoveryCodeBytes);
      const { user: updated } = await authApi.setInitialPassword({ newPassword: password, masterKeyWrap, recoveryKeyWrap });
      return { updated, recoveryKit: formatRecoveryCode(recoveryCodeBytes) };
    },
    // `setUser` is deliberately *not* called here. The parent switches from
    // this form to `PasswordChangeForm` the instant `user.masterKeyWrap`
    // turns truthy, and React 18+ batches that state update with this one —
    // so calling `setUser(updated)` here unmounted this component in the
    // same render that set `recoveryKit`, and the one-time recovery code was
    // generated, wrapped, sent to the server, and never painted to the
    // screen. Reproduced live: the settings page jumped straight from "no
    // password yet" to "Change password" with no recovery-code screen ever
    // shown. `setUser` now runs only from the Done button below, after the
    // person has confirmed they saved the code.
    onSuccess: ({ updated, recoveryKit: kit }) => {
      setPendingUser(updated);
      setPassword('');
      setError(null);
      setRecoveryKit(kit);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Something went wrong'),
  });

  if (recoveryKit) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-secondary">
          Save this recovery code somewhere safe — it&apos;s the only time it will be shown.
        </p>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-3 text-center font-mono text-sm tracking-wider text-foreground">
          {recoveryKit}
        </div>
        <Button type="button" variant="ghost" onClick={() => navigator.clipboard.writeText(recoveryKit)}>
          Copy to clipboard
        </Button>
        <label className="flex items-start gap-2 text-sm text-secondary">
          <input type="checkbox" checked={savedConfirmed} onChange={(e) => setSavedConfirmed(e.target.checked)} className="mt-0.5" />
          I&apos;ve saved this recovery code somewhere safe.
        </label>
        <Button
          type="button"
          disabled={!savedConfirmed}
          onClick={() => {
            setUser(pendingUser);
            setRecoveryKit(null);
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-sm text-secondary">
        You signed up with Google, so there&apos;s no password yet — capsule content is end-to-end encrypted and
        needs one to unlock.
      </p>
      <Input label="Password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <Button type="submit" loading={mutation.isPending} disabled={password.length < 8}>
        Set password
      </Button>
    </form>
  );
}

function EmailChangeForm() {
  const { user, refreshUser } = useAuth();
  const { show } = useToast();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: () => authApi.requestEmailChange({ newEmail, currentPassword: password }),
    onSuccess: async () => {
      setError(null);
      await refreshUser();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Could not start the email change'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => authApi.confirmEmailChange({ code }),
    onSuccess: async () => {
      setCode('');
      setNewEmail('');
      setPassword('');
      setError(null);
      await refreshUser();
      show('Email address updated');
    },
    onError: () => setError('Invalid or expired code'),
  });

  if (user?.pendingEmail) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          confirmMutation.mutate();
        }}
      >
        <p className="text-sm text-secondary">Enter the code sent to {user.pendingEmail} to confirm.</p>
        <OtpInput value={code} onChange={setCode} />
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button type="submit" loading={confirmMutation.isPending} disabled={code.length !== 6}>
          Confirm
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        requestMutation.mutate();
      }}
    >
      <Input label="New email address" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
      <Input label="Current password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <Button type="submit" loading={requestMutation.isPending} disabled={!newEmail || !password}>
        Send confirmation code
      </Button>
    </form>
  );
}

export default function AccountSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="font-[var(--font-display)] text-lg text-foreground">Email</h2>
        <p className="text-sm text-secondary">Current: {user?.email}</p>
        <EmailChangeForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[var(--font-display)] text-lg text-foreground">Password</h2>
        {user?.masterKeyWrap ? <PasswordChangeForm /> : <SetInitialPasswordForm />}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[var(--font-display)] text-lg text-foreground">Sessions</h2>
        <SessionsList />
      </section>
    </div>
  );
}
