'use client';

import { Button, OtpInput } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiClientError, authApi } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, loading, logout, setUser } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (user?.emailVerifiedAt) {
      router.replace('/home');
    }
  }, [user, router]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const { user: verifiedUser } = await authApi.verifyEmail({ code });
      setUser(verifiedUser);
      router.push('/home');
    } catch (err) {
      setError(err instanceof ApiClientError ? 'That code is incorrect or expired.' : 'Something went wrong.');
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    await authApi.resendVerifyEmail();
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground">Check your email</h1>
      <p className="text-[length:var(--text-body-s)] text-secondary">
        Enter the 6-digit code we sent to {user?.email ?? 'your email'}.
      </p>

      <OtpInput value={code} onChange={setCode} disabled={submitting} />

      {error ? (
        <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <Button fullWidth loading={submitting} disabled={code.length !== 6} onClick={handleSubmit}>
        Verify
      </Button>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown > 0}
        className="motion-instant text-[length:var(--text-body-s)] text-secondary underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-60"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>

      <button
        type="button"
        onClick={() => {
          void logout().then(() => router.push('/signup'));
        }}
        className="motion-instant text-[length:var(--text-caption)] text-secondary underline underline-offset-2 hover:text-foreground"
      >
        Wrong email? Start over
      </button>
    </div>
  );
}
