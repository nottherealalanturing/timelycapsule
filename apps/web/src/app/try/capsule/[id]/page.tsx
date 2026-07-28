'use client';

import { Button, useToast } from '@tc/ui-web';
import type { GuestCapsuleResponse } from '@tc/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CountdownDisplay } from '../../../../components/CountdownDisplay';
import { guestApi } from '../../../../lib/api-client';
import { getGuestCapsule, getGuestToken } from '../../../../lib/guest-store';

/** Device-local guest status page (01 §4.1b / 02 §5.2a) — no account, so this only works from the device that sealed it. */
export default function GuestCapsuleStatusPage() {
  const params = useParams<{ id: string }>();
  const { show } = useToast();
  const [capsule, setCapsule] = useState<GuestCapsuleResponse | null>(null);
  const [error, setError] = useState(false);

  const guestToken = getGuestToken();
  const cache = getGuestCapsule();
  const shareUrl = cache && cache.capsuleId === params.id ? `${typeof window !== 'undefined' ? window.location.origin : ''}/c/${cache.recipientToken}#k=${cache.capsuleKeyB64}` : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!guestToken) {
        setError(true);
        return;
      }
      guestApi
        .getCapsule(guestToken, params.id)
        .then(setCapsule)
        .catch(() => setError(true));
    }, 0);
    return () => clearTimeout(timer);
  }, [guestToken, params.id]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-[var(--font-display)] text-xl text-foreground">This capsule isn&apos;t on this device.</h1>
        <p className="max-w-md text-secondary">Guest capsules are device-local — try opening this page on the device you sealed it from.</p>
        <Link href="/try">
          <Button variant="secondary">Start a new capsule</Button>
        </Link>
      </main>
    );
  }

  if (!capsule) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-secondary">Retrieving your capsule…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-16 text-center">
      <div
        className="flex h-32 w-full items-end justify-center rounded-[var(--radius-card)]"
        style={capsule.cover?.kind === 'gradient' ? { background: capsule.cover.value } : { background: 'var(--color-bg-raised)' }}
      >
        <p className="pb-3 font-[var(--font-display)] text-lg text-white">{capsule.title ?? 'Your capsule'}</p>
      </div>

      {capsule.unlockAt ? <CountdownDisplay target={new Date(capsule.unlockAt)} className="text-3xl font-medium text-foreground" /> : null}
      <p className="text-sm text-secondary">State: {capsule.state}</p>

      {shareUrl ? (
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(shareUrl);
            show('Link copied');
          }}
        >
          Copy link again
        </Button>
      ) : (
        <p className="text-sm text-secondary">The share link isn&apos;t cached on this device anymore — check wherever you originally sent it.</p>
      )}

      <div className="w-full border-t border-[var(--color-text-secondary)]/15 pt-6">
        <p className="mb-3 text-sm text-secondary">Keep it safe with a free account — get five capsules, media, and email delivery.</p>
        <Link href={`/signup?guestToken=${encodeURIComponent(guestToken ?? '')}`}>
          <Button size="lg">Sign up free</Button>
        </Link>
      </div>
    </main>
  );
}
