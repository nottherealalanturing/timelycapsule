'use client';

import { Button, Input } from '@tc/ui-web';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { GoogleSignInButton } from '../../../components/GoogleSignInButton';
import { ApiClientError } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, googleOAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      router.push('/home');
    } catch (err) {
      // Generic message regardless of cause — no user enumeration (02-UX-DESIGN.md §5.2).
      setError(
        err instanceof ApiClientError && err.code === 'rate_limited'
          ? 'Too many attempts. Please try again shortly.'
          : 'Invalid email or password.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError(null);
    try {
      await googleOAuth(idToken);
      router.push('/home');
    } catch {
      setError('Invalid email or password.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground">Log in</h1>

      <GoogleSignInButton onCredential={handleGoogle} />

      <div className="flex items-center gap-3 text-[length:var(--text-caption)] text-secondary" role="separator">
        <div className="h-px flex-1 bg-[var(--color-rule)]" />
        or
        <div className="h-px flex-1 bg-[var(--color-rule)]" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <Button type="submit" fullWidth loading={loading}>
          Log in
        </Button>
      </form>

      <div className="flex justify-between text-[length:var(--text-body-s)]">
        <Link href="/reset" className="text-secondary underline underline-offset-2">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-2">
          Create account
        </Link>
      </div>
    </div>
  );
}
