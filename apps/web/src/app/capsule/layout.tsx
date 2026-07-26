'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';

/**
 * Full-screen takeover shell for the composer (02-UX-DESIGN.md §5.5) — no
 * sidebar/nav chrome, unlike (app)'s layout. Each page renders its own top
 * bar since its contents (close button, autosave status) are composer-state
 * dependent.
 */
export default function CapsuleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    } else if (!loading && user && !user.emailVerifiedAt) {
      router.replace('/verify');
    }
  }, [loading, user, router]);

  if (loading || !user || !user.emailVerifiedAt) {
    return null;
  }

  return <div className="min-h-screen">{children}</div>;
}
