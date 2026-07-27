'use client';

import { Button, Input, PasswordStrengthMeter } from '@tc/ui-web';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { GoogleSignInButton } from '../../../components/GoogleSignInButton';
import { ApiClientError } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { clearGuestSession, getGuestToken } from '../../../lib/guest-store';

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signup, googleOAuth } = useAuth();
  // Present when arriving from /try's post-seal or status-page CTA (T-15b) — claims the guest capsule on success.
  const guestToken = searchParams.get('guestToken') ?? getGuestToken() ?? undefined;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { recoveryKit: kit } = await signup({ email, password, displayName, guestToken });
      if (guestToken) clearGuestSession();
      setRecoveryKit(kit);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (recoveryKit) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-[var(--font-display)] text-xl text-foreground">Save your recovery code</h1>
        <p className="text-sm text-secondary">
          Your capsules are end-to-end encrypted — we never see their contents, which means we can&apos;t recover
          your account if you lose both your password and this code. Save it somewhere safe (a password manager,
          printed and filed away). This is the only time it will be shown.
        </p>
        <div className="rounded-lg border border-[var(--color-text-secondary)]/20 bg-[var(--color-surface-raised)] p-4 text-center font-mono text-lg tracking-wider text-foreground">
          {recoveryKit}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigator.clipboard.writeText(recoveryKit)}
        >
          Copy to clipboard
        </Button>
        <label className="flex items-start gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={savedConfirmed}
            onChange={(e) => setSavedConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          I&apos;ve saved this recovery code somewhere safe.
        </label>
        <Button type="button" fullWidth disabled={!savedConfirmed} onClick={() => router.push('/verify')}>
          Continue
        </Button>
      </div>
    );
  }

  async function handleGoogle(idToken: string) {
    setError(null);
    try {
      await googleOAuth(idToken, guestToken);
      if (guestToken) clearGuestSession();
      router.push('/home');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[var(--font-display)] text-xl text-foreground">Create your account</h1>

      <GoogleSignInButton onCredential={handleGoogle} />

      <div className="flex items-center gap-3 text-xs text-secondary" role="separator">
        <div className="h-px flex-1 bg-[var(--color-text-secondary)]/20" />
        or
        <div className="h-px flex-1 bg-[var(--color-text-secondary)]/20" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Name"
          type="text"
          autoComplete="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <label className="flex items-start gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          I agree to the Terms of Service and Privacy Policy.
        </label>

        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

        <Button type="submit" fullWidth loading={loading} disabled={!agreed}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-secondary">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}
