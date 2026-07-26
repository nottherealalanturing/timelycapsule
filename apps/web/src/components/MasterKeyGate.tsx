'use client';

import { Button, Dialog, Input } from '@tc/ui-web';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../lib/auth-context';
import { useMasterKey } from '../lib/master-key-context';

/**
 * Gates any subtree that needs the owner master key in memory to decrypt
 * content (the composer, the capsule detail view). The key is never
 * persisted (zero-access rule), so it's gone after every page refresh —
 * this re-derives it from the password without a real page navigation.
 */
export function MasterKeyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { masterKey, unlockWithPassword } = useMasterKey();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (masterKey) {
    return <>{children}</>;
  }

  if (!user) {
    return null;
  }

  if (!user.masterKeyWrap) {
    return (
      <Dialog open onOpenChange={() => {}} title="Set a password to continue">
        <p className="text-sm text-secondary">
          This account doesn&apos;t have an encryption password set yet, so capsule content can&apos;t be unlocked.
          Set a password in Settings, then come back here.
        </p>
      </Dialog>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockWithPassword(user!.masterKeyWrap, password);
      setPassword('');
    } catch {
      setError('Wrong password. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Unlock your capsules"
      description="Enter your password to decrypt this session — it's never sent to our servers."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button type="submit" fullWidth loading={loading}>
          Unlock
        </Button>
      </form>
    </Dialog>
  );
}
