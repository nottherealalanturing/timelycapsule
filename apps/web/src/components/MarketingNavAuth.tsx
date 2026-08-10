'use client';

import Link from 'next/link';
import { useAuth } from '../lib/auth-context';

/**
 * The marketing header/footer's "Log in" link, made auth-aware.
 *
 * Reuses `useAuth()` — the same session state `(app)` and `(auth)` already
 * read — rather than a second, marketing-only notion of "am I signed in."
 * `AuthProvider` wraps the whole app from the root layout, so this works
 * identically on every marketing route without that route needing to know
 * anything about auth itself.
 *
 * Renders nothing while `loading` (a stored token exists and `/me` hasn't
 * resolved yet) rather than showing "Log in" and then swapping to "Home" a
 * beat later — an authenticated visitor should never see the wrong state,
 * even briefly.
 */
export function MarketingNavAuth({ className }: { className?: string }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  return user ? (
    <Link href="/home" className={className}>
      Home
    </Link>
  ) : (
    <Link href="/login" className={className}>
      Log in
    </Link>
  );
}
