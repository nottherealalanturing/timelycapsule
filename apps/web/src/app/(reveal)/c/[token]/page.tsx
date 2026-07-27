'use client';

import { decodeCapsuleKeyFromLink, decryptBytes, fromBase64Url } from '@tc/crypto';
import { Button } from '@tc/ui-web';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { RevealResponse } from '@tc/contracts';
import { ApiClientError, revealApi } from '../../../../lib/api-client';
import { CountdownDisplay } from '../../../../components/CountdownDisplay';
import { SealStampsRow } from '../../../../components/reveal/SealStampsRow';
import { PlaceGate } from '../../../../components/reveal/PlaceGate';
import { PassphraseGate } from '../../../../components/reveal/PassphraseGate';
import { IdentityGate } from '../../../../components/reveal/IdentityGate';
import { RevealCeremony } from '../../../../components/reveal/RevealCeremony';

type PageState = 'loading' | 'locked' | 'unlocked' | 'withdrawn' | 'expired' | '404' | 'rate-limited';

function SystemPage({ headline, body, cta }: { headline: string; body: string; cta?: { label: string; href: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-[var(--font-display)] text-2xl text-foreground">{headline}</h1>
      <p className="max-w-md text-secondary">{body}</p>
      {cta ? (
        <a href={cta.href}>
          <Button variant="secondary">{cta.label}</Button>
        </a>
      ) : null}
    </main>
  );
}

async function decryptContentDoc(contentDocEnc: string, key: Uint8Array): Promise<unknown> {
  const bytes = fromBase64Url(contentDocEnc);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plaintext = await decryptBytes(key, iv, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
}

function keyFromUrlFragment(): Uint8Array | null {
  if (typeof window === 'undefined' || !/(?:^|[#&])k=/.test(window.location.hash)) return null;
  try {
    return decodeCapsuleKeyFromLink(window.location.hash);
  } catch {
    return null;
  }
}

function icsDataUrl(unlockAt: string, senderName: string): string {
  const dt = new Date(unlockAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimelyCapsule//Reveal//EN',
    'BEGIN:VEVENT',
    `DTSTART:${dt}`,
    `SUMMARY:A TimelyCapsule from ${senderName} opens`,
    'DESCRIPTION:Your capsule unlocks today.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export default function RevealPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<RevealResponse | null>(null);
  const [placeGate, setPlaceGate] = useState<string | null>(null);
  const [identityGate, setIdentityGate] = useState<string | null>(null);
  const [capsuleKey, setCapsuleKey] = useState<Uint8Array | null>(null);
  const [decryptedDoc, setDecryptedDoc] = useState<unknown>(undefined);
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);

  async function load() {
    try {
      const res = await revealApi.get(token, {
        placeGate: placeGate ?? undefined,
        identityGate: identityGate ?? undefined,
      });
      setData(res);
      setState(res.status as PageState);
    } catch (err) {
      setState(err instanceof ApiClientError && err.status === 429 ? 'rate-limited' : '404');
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when gates advance, not on every render
  }, [placeGate, identityGate]);

  // At T-0 the page flips live into the reveal without a manual refresh.
  useEffect(() => {
    if (state !== 'locked' || data?.status !== 'locked' || !data.unlockAt) return;
    const ms = new Date(data.unlockAt).getTime() - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => void load(), Math.min(ms + 1000, 2_147_000_000));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, data]);

  // recipient_local unlock mode resolves wall-clock time per recipient timezone — report it once.
  useEffect(() => {
    if (state !== 'locked' || data?.status !== 'locked' || !data.unlockLocal) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timer = setTimeout(() => void revealApi.tzInfer(token, tz), 0);
    return () => clearTimeout(timer);
  }, [state, data, token]);

  // Once unlocked content is available, derive the capsule key (URL fragment) and decrypt the letter.
  useEffect(() => {
    if (state !== 'unlocked' || data?.status !== 'unlocked' || !data.contentDocEnc) return;
    if (data.requireIdentityVerification && !data.identityVerified) return;
    if (capsuleKey) {
      void decryptContentDoc(data.contentDocEnc, capsuleKey).then(setDecryptedDoc);
      return;
    }
    if (data.passphraseSeal) return; // waiting on PassphraseGate to unwrap
    const fragmentKey = keyFromUrlFragment();
    if (!fragmentKey) return;
    const timer = setTimeout(() => {
      setCapsuleKey(fragmentKey);
      void decryptContentDoc(data.contentDocEnc!, fragmentKey).then(setDecryptedDoc);
    }, 0);
    return () => clearTimeout(timer);
  }, [state, data, capsuleKey]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg text-foreground">Retrieving your capsule from the timestream…</p>
        <p className="text-sm text-secondary">Hold tight, time traveler — good moments are worth the wait.</p>
      </main>
    );
  }

  if (state === '404') {
    return (
      <SystemPage
        headline="Lost in time."
        body="This capsule doesn't exist in this timeline. The link may be mistyped — or the page has drifted somewhere we can't follow."
        cta={{ label: 'Return to the present', href: '/' }}
      />
    );
  }

  if (state === 'withdrawn') {
    return (
      <SystemPage
        headline="Lost in time."
        body="The sender called this capsule back before it could open. Its contents remain unwritten history."
        cta={{ label: 'Return to the present', href: '/' }}
      />
    );
  }

  if (state === 'expired') {
    return (
      <SystemPage
        headline="This capsule has completed its journey."
        body="Its moment came and went — what was inside belongs to the past now."
        cta={{ label: 'Back to the present', href: '/' }}
      />
    );
  }

  if (state === 'rate-limited') {
    return <SystemPage headline="Even time travel needs a breather." body="Try again in a moment." />;
  }

  if (state === 'locked' && data?.status === 'locked') {
    const placeSeal = data.seals.find((s) => s.type === 'place' && !s.satisfied);
    const identitySeal = data.seals.find((s) => s.type === 'identity' && !s.satisfied);

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-sm text-secondary">From {data.senderName}</p>
        <h1 className="font-[var(--font-display)] text-3xl text-foreground">Sealed until the right moment</h1>
        {data.teaser ? <p className="max-w-md text-secondary">{data.teaser}</p> : null}
        {data.unlockAt ? <CountdownDisplay target={new Date(data.unlockAt)} className="text-4xl font-medium text-foreground" /> : null}
        <SealStampsRow seals={data.seals} passphraseUnlocked={false} />

        {placeSeal && placeSeal.type === 'place' ? (
          <PlaceGate token={token} name={placeSeal.name} radiusM={placeSeal.radiusM} onSatisfied={(gateToken) => setPlaceGate(gateToken)} />
        ) : identitySeal ? (
          <IdentityGate token={token} onSatisfied={(gateToken) => setIdentityGate(gateToken)} />
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            loading={remindBusy}
            onClick={async () => {
              setRemindBusy(true);
              try {
                await revealApi.remind(token, !remindEnabled);
                setRemindEnabled((v) => !v);
              } finally {
                setRemindBusy(false);
              }
            }}
          >
            {remindEnabled ? 'Notifying you when it opens ✓' : 'Notify me when it opens'}
          </Button>
          {data.unlockAt ? (
            <a href={icsDataUrl(data.unlockAt, data.senderName)} download="timelycapsule.ics" className="text-sm text-[var(--color-accent-gold)] underline">
              Add to calendar
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  if (state === 'unlocked' && data?.status === 'unlocked') {
    if (data.requireIdentityVerification && !data.identityVerified && !identityGate) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <IdentityGate token={token} onSatisfied={(gateToken) => setIdentityGate(gateToken)} />
        </main>
      );
    }

    if (!capsuleKey && data.passphraseSeal) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <PassphraseGate
            hint={data.passphraseSeal.hint}
            wrappedKeyB64={data.passphraseSeal.wrappedKeyB64}
            onUnwrapped={(key) => setCapsuleKey(key)}
          />
        </main>
      );
    }

    if (!capsuleKey && !data.passphraseSeal) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-secondary">This link is missing its key. Ask the sender for a fresh one.</p>
        </main>
      );
    }

    if (decryptedDoc === undefined) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-lg text-foreground">Retrieving your capsule from the timestream…</p>
        </main>
      );
    }

    return (
      <RevealCeremony
        token={token}
        senderName={data.senderName}
        contentDoc={decryptedDoc}
        media={data.media}
        capsuleKey={capsuleKey!}
        location={data.location}
        replyPrompt={data.replyPrompt}
        allowDownload={data.allowDownload}
        alreadyOpened={data.alreadyOpened}
      />
    );
  }

  return null;
}
