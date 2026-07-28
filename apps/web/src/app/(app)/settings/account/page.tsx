'use client';

import { unwrapMasterKeyWithPassword, wrapMasterKeyWithPassword } from '@tc/crypto';
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
        <div key={session.id} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 p-3">
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
        <PasswordChangeForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[var(--font-display)] text-lg text-foreground">Sessions</h2>
        <SessionsList />
      </section>
    </div>
  );
}
