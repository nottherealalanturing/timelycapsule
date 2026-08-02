'use client';

import {
  formatRecoveryCode,
  generateMasterKey,
  generateRecoveryCode,
  wrapMasterKeyWithPassword,
  wrapMasterKeyWithRecoveryCode,
} from '@tc/crypto';
import { Button, Checkbox, Dialog, Input } from '@tc/ui-web';
import { useState, type FormEvent, type ReactNode } from 'react';
import { authApi } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { RecoveryKit } from './RecoveryKit';
import { useMasterKey } from '../lib/master-key-context';

/**
 * Gates any subtree that needs the owner master key in memory to decrypt
 * content (the composer, the capsule detail view). The key is never
 * persisted (zero-access rule), so it's gone after every page refresh —
 * this re-derives it from the password without a real page navigation.
 */
export function MasterKeyGate({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const { masterKey, setMasterKey, unlockWithPassword } = useMasterKey();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  // Checked before `masterKey` deliberately: handleSetPassword below sets
  // both masterKey and recoveryKit together, so if masterKey were checked
  // first this dialog would never actually show — it'd short-circuit
  // straight through to `children` the instant the key was set, silently
  // skipping the mandatory recovery-kit nag entirely.
  if (recoveryKit) {
    return renderRecoveryKit(recoveryKit);
  }

  if (masterKey) {
    return <>{children}</>;
  }

  if (!user) {
    return null;
  }

  function renderRecoveryKit(kit: string) {
    return (
      <Dialog open onOpenChange={() => {}} title="Save your recovery code">
        <div className="flex flex-col gap-4">
          <p className="text-[length:var(--text-body-s)] text-secondary">
            Your capsules are end-to-end encrypted — we never see their contents, which means we can&apos;t recover
            your account if you lose both your password and this code. Save it somewhere safe. This is the only
            time it will be shown.
          </p>
          <RecoveryKit code={kit} />
          <Checkbox
            checked={savedConfirmed}
            onChange={(e) => setSavedConfirmed(e.target.checked)}
            label="I&apos;ve saved this recovery code somewhere safe."
          />
          <Button type="button" fullWidth disabled={!savedConfirmed} onClick={() => setRecoveryKit(null)}>
            Continue
          </Button>
        </div>
      </Dialog>
    );
  }

  // Accounts created via Google-only signup never generate a master key
  // (there's no password to derive it from) — this is the one place such an
  // account can establish one, since Settings' password change requires an
  // existing password to re-wrap from, which doesn't apply here.
  if (!user.masterKeyWrap) {
    async function handleSetPassword(e: FormEvent) {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const key = generateMasterKey();
        const masterKeyWrap = await wrapMasterKeyWithPassword(key, password);
        const recoveryCodeBytes = generateRecoveryCode();
        const recoveryKeyWrap = await wrapMasterKeyWithRecoveryCode(key, recoveryCodeBytes);
        const { user: updated } = await authApi.setInitialPassword({ newPassword: password, masterKeyWrap, recoveryKeyWrap });
        setUser(updated);
        setMasterKey(key);
        setPassword('');
        setRecoveryKit(formatRecoveryCode(recoveryCodeBytes));
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    return (
      <Dialog
        open
        onOpenChange={() => {}}
        title="Set a password to continue"
        description="You signed up with Google, so there's no password yet — capsule content is end-to-end encrypted and needs one to unlock. This only takes a moment."
      >
        <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          <Button type="submit" fullWidth loading={loading}>
            Set password
          </Button>
        </form>
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
