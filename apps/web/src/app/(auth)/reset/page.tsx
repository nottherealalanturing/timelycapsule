'use client';

import { Button, Input } from '@tc/ui-web';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { authApi } from '../../../lib/api-client';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      // Always show the same success state — no account enumeration.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword({ token: token!, newPassword });
      router.push('/login');
    } catch {
      setError('This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  if (token) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground">Set a new password</h1>
        <form onSubmit={handleReset} className="flex flex-col gap-4" noValidate>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <Button type="submit" fullWidth loading={loading}>
            Reset password
          </Button>
        </form>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground">Check your email</h1>
        <p className="text-[length:var(--text-body-s)] text-secondary">
          If an account exists for {email}, we&apos;ve sent a link to reset your password.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground">Reset your password</h1>
      <form onSubmit={handleForgot} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" fullWidth loading={loading}>
          Send reset link
        </Button>
      </form>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
