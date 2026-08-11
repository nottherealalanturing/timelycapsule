'use client';

import { Button, DualClock, Hallmark, MeridianApproach, useToast } from '@tc/ui-web';
import type { GuestCapsuleResponse, ReplyThread } from '@tc/contracts';
import { fromBase64Url } from '@tc/crypto';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { guestApi } from '../../../../lib/api-client';
import { useCorrectedNow } from '../../../../lib/use-corrected-now';
import { formatAbsoluteDate, horizonPhrase } from '../../../../lib/waiting';
import { getGuestCapsule, getGuestToken } from '../../../../lib/guest-store';
import { Correspondence } from '../../../../components/reply/Correspondence';

/** The guest's view of their own wait — the same reading the owner gets, minus the account. */
function GuestWait({
  unlockAt,
  sealedAt,
  state,
}: {
  unlockAt: string | null;
  sealedAt: string | null;
  state: GuestCapsuleResponse['state'];
}) {
  const target = unlockAt ? new Date(unlockAt) : null;
  const nowMs = useCorrectedNow(target);
  const sealedMs = sealedAt ? new Date(sealedAt).getTime() : null;

  if (state !== 'sealed' || !target || nowMs === null) {
    return (
      <div className="flex w-full flex-col gap-0.5 text-left">
        <Hallmark>Status</Hallmark>
        <span className="text-[length:var(--text-body-s)] text-secondary">{state}</span>
      </div>
    );
  }

  const remainingMs = Math.max(0, target.getTime() - nowMs);

  return (
    <section className="flex w-full flex-col gap-5 text-left" aria-label="The wait">
      {sealedMs !== null ? <DualClock elapsedMs={nowMs - sealedMs} remainingMs={remainingMs} /> : null}
      <MeridianApproach remainingMs={remainingMs} />
      <div className="flex flex-col gap-0.5">
        <p className="text-[length:var(--text-body-s)] text-foreground">
          Sealed until {formatAbsoluteDate(target.toISOString())}
        </p>
        <p className="text-[length:var(--text-caption)] text-secondary">{horizonPhrase(remainingMs)}</p>
      </div>
    </section>
  );
}

/** Device-local guest status page (01 §4.1b / 02 §5.2a) — no account, so this only works from the device that sealed it. */
export default function GuestCapsuleStatusPage() {
  const params = useParams<{ id: string }>();
  const { show } = useToast();
  const [capsule, setCapsule] = useState<GuestCapsuleResponse | null>(null);
  const [error, setError] = useState(false);

  const [threads, setThreads] = useState<ReplyThread[]>([]);

  const guestToken = getGuestToken();
  const cache = getGuestCapsule();
  // The guest's copy of the capsule key, cached on this device when they
  // sealed — the same key the recipient got in the link, and the only reason
  // a guest can read a reply at all.
  // `fromBase64Url`, not `decodeCapsuleKeyFromLink`: the cache holds the bare
  // key, while that helper parses a whole `#k=…` fragment and throws on
  // anything else — which took the entire page down rather than the one
  // section that needed the key.
  const capsuleKey = cache && cache.capsuleId === params.id ? fromBase64Url(cache.capsuleKeyB64) : null;
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
      guestApi
        .replies(guestToken, params.id)
        .then((res) => setThreads(res.data))
        // A correspondence that will not load must not take the capsule down
        // with it.
        .catch(() => {});
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
      {/* The band is decorative only — never carries text — matching
          `coverStyle` everywhere else it's used (received, collections, the
          authenticated capsule page). It used to hold the title directly in
          `text-white`, which read fine against a cover gradient but went
          invisible against the plain `--color-bg-raised` fallback every
          guest capsule actually has, since cover gradients were removed. */}
      <div
        className="h-32 w-full rounded-[var(--radius-card)]"
        style={capsule.cover?.kind === 'gradient' ? { background: capsule.cover.value } : { background: 'var(--color-bg-raised)' }}
      />
      <p className="font-[var(--font-display)] text-lg text-foreground">{capsule.title ?? 'Your capsule'}</p>

      {/*
        The guest contract *does* carry `sealedAt`, so this surface gets the
        full Dual Clock — elapsed and remaining together, per `03 §V.1`. The
        Meridian and the literal date complete the same waiting reading the
        owner and recipient screens now share.
      */}
      <GuestWait unlockAt={capsule.unlockAt} sealedAt={capsule.sealedAt} state={capsule.state} />

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

      {/*
        Anything written back, readable here.

        A guest can send a capsule, so a guest can be replied to — and without
        this the reply would sit encrypted on a server with the only person
        able to read it unable to reach it. Left-aligned inside the centred
        page because it is prose, and prose is read from a margin.
      */}
      {threads.length > 0 ? (
        <div className="w-full text-left">
          {threads.map((thread) => (
            <Correspondence
              key={thread.recipientId}
              replies={thread.replies}
              capsuleKey={capsuleKey}
              theirName={thread.recipientLabel ?? 'Them'}
              viewerIs="sender"
              closedReason="Keep this with a free account to write back."
            />
          ))}
        </div>
      ) : null}

      <div className="w-full border-t border-[var(--color-rule)] pt-6">
        <p className="mb-3 text-sm text-secondary">Keep it safe with a free account — get five capsules, media, and email delivery.</p>
        <Link href={`/signup?guestToken=${encodeURIComponent(guestToken ?? '')}`}>
          <Button size="lg">Sign up free</Button>
        </Link>
      </div>
    </main>
  );
}
