'use client';

import { decodeCapsuleKeyFromLink, decryptBytes, fromBase64Url } from '@tc/crypto';
import { Button, DualClock, Hallmark, MeridianApproach, formatDuration } from '@tc/ui-web';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { RevealResponse } from '@tc/contracts';
import { ApiClientError, revealApi } from '../../../../lib/api-client';
import { useCorrectedNow } from '../../../../lib/use-corrected-now';
import { formatAbsoluteDate, horizonPhrase } from '../../../../lib/waiting';
import { SealStampsRow } from '../../../../components/reveal/SealStampsRow';
import { PlaceGate } from '../../../../components/reveal/PlaceGate';
import { PassphraseGate } from '../../../../components/reveal/PassphraseGate';
import { IdentityGate } from '../../../../components/reveal/IdentityGate';
import { RevealCeremony } from '../../../../components/reveal/RevealCeremony';

type PageState = 'loading' | 'locked' | 'unlocked' | 'withdrawn' | 'expired' | '404' | 'rate-limited';

/**
 * Terminal states on the recipient path.
 *
 * Rewritten to voice. V1 spoke in whimsy — *"Lost in time."*, *"Hold tight,
 * time traveler"* — which `07 §VIII` rules out directly: the register is
 * "closer to a shipping manifest or a land registry than to a greetings card",
 * and `07 §VIII.2` forbids apologising for the wait or dramatising its end.
 * These now state what happened, in the past tense (`09 §XVI`), and stop.
 */
function SystemPage({
  state,
  headline,
  body,
  cta,
}: {
  /** Hallmarked, so the page is legible as a reading and not as an error card. */
  state: string;
  headline: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      {/*
        The same frame the waiting screen wears: hallmark, rule, measure, and
        left-aligned. These pages used to be centred headline-and-button error
        cards — the copy was in voice, but nothing about the surface said which
        product it belonged to, and they sat one navigation away from a screen
        built entirely out of hallmarks and rules. `07 §VI.5`: the institution
        is static, and it is present in every state, including the ones that
        end badly.
      */}
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-rule)] pb-4">
        <Hallmark>TimelyCapsule</Hallmark>
        <Hallmark>{state}</Hallmark>
      </header>

      <div className="flex flex-col gap-3">
        <h1 className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)] text-foreground">{headline}</h1>
        <p className="text-[length:var(--text-body-s)] text-secondary">{body}</p>
      </div>

      {cta ? (
        <div className="border-t border-[var(--color-rule)] pt-6">
          <a href={cta.href}>
            <Button variant="secondary">{cta.label}</Button>
          </a>
        </div>
      ) : null}
    </main>
  );
}

/**
 * **The waiting screen.** `03 §V.3` makes this the primary screen of the
 * product — "it gets the most craft in the product — more than the composer,
 * more than the reveal. If the waiting state looks like a placeholder, we've
 * said the wait is dead air."
 *
 * Four things carry it, and none of them is decoration:
 *
 * 1. **The Meridian** (`07 §III`, device 5) is the axis. The capsule sits at
 *    its distance from the line it will cross, warming as it closes — position
 *    and temperature, the two things `03 §V.5` names as having to be *visibly
 *    different* if you come back in six months.
 * 2. **The literal date leads** (`07 §VIII.1`, §VIII.4). V1's headline was
 *    "Sealed until the right moment", which is precisely the greetings-card
 *    register the voice rules exclude, and it withheld the one fact a person
 *    waiting actually wants.
 * 3. **The Dual Clock**, signature device 2 (`07 §III`) — the component that
 *    "carries more brand than the logo, because it is on every screen". It was
 *    absent here for one reason: `RevealLockedResponseSchema` carried no
 *    `sealedAt`, so this screen could state only what remained. That gap is
 *    now closed in the contract, and both figures are stated with the
 *    weighting `07 §XV.5` specifies. Elapsed is the figure that visibly
 *    accumulates — the reason a three-year wait reads as custody rather than
 *    as a still image.
 * 4. **Silence.** `07 §II.5` treats it as a design material. There is no
 *    reassurance copy, no progress language, nothing that fills the wait with
 *    talk about the wait.
 *
 * No motion is added here, and that is deliberate. Motion Constitution 5 —
 * "the mark never animates; institution is static" — and rule 3's ban on
 * anything that reads as loading leave no opening for ambient movement. The
 * page is already alive in the only way the instrument permits: the reading
 * changes because time actually passed, at the granularity
 * `useCorrectedNow` judges the figure needs.
 */
function LockedWait({
  token,
  data,
  onPlaceGate,
  onIdentityGate,
}: {
  token: string;
  data: Extract<RevealResponse, { status: 'locked' }>;
  onPlaceGate: (gateToken: string) => void;
  onIdentityGate: (gateToken: string) => void;
}) {
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);

  const unlockDate = data.unlockAt ? new Date(data.unlockAt) : null;
  const nowMs = useCorrectedNow(unlockDate);
  const remainingMs = unlockDate && nowMs !== null ? Math.max(0, unlockDate.getTime() - nowMs) : null;
  const sealedMs = data.sealedAt ? new Date(data.sealedAt).getTime() : null;

  const placeSeal = data.seals.find((s) => s.type === 'place' && !s.satisfied);
  const identitySeal = data.seals.find((s) => s.type === 'identity' && !s.satisfied);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-10 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <Hallmark>{data.publicId}</Hallmark>
        <Hallmark>Sealed</Hallmark>
      </header>

      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)] text-foreground">
          {data.senderName} sealed this for you.
        </p>
        {data.teaser ? (
          <p className="text-[length:var(--text-body)] text-secondary">{data.teaser}</p>
        ) : null}
      </div>

      {remainingMs !== null && unlockDate ? (
        <section className="flex flex-col gap-5" aria-label="The wait">
          <MeridianApproach remainingMs={remainingMs} />

          <div className="flex flex-col gap-1">
            {/* The ramp never carries text (05 §Two rules) — the date does. */}
            <p className="text-[length:var(--text-body)] text-foreground">
              Sealed until {formatAbsoluteDate(unlockDate.toISOString())}
            </p>
            <p className="text-[length:var(--text-body-s)] text-secondary">{horizonPhrase(remainingMs)}</p>
          </div>

          {/*
            Both figures, weighted by where the capsule is in its life — the
            refinement `07 §XV.5` specifies and `clockEmphasis` implements.
            Elapsed is the figure that visibly accumulates, and it is what
            makes a long wait read as something happening rather than nothing
            happening (`07 §XI`'s acceptance test). Where the sender never
            sealed through the normal path there is no elapsed to state, so
            the reading falls back to remaining alone rather than inventing a
            zero — `07 §XV.5` is explicit that a fabricated day-one elapsed is
            worse than none.
          */}
          <div className="border-t border-[var(--color-rule)] pt-4">
            {sealedMs !== null ? (
              <DualClock elapsedMs={Math.max(0, nowMs! - sealedMs)} remainingMs={remainingMs} size="lg" />
            ) : (
              <div className="flex flex-col gap-0.5">
                <Hallmark>Remaining</Hallmark>
                <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[length:var(--text-display-s)] leading-none tabular-nums text-foreground">
                  {formatDuration(remainingMs)}
                </span>
              </div>
            )}
          </div>
        </section>
      ) : data.unlockLocal ? (
        <section className="flex flex-col gap-1" aria-label="The wait">
          <p className="text-[length:var(--text-body)] text-foreground">
            Sealed until {formatAbsoluteDate(`${data.unlockLocal.date}T${data.unlockLocal.time}:00`)}
          </p>
          <p className="text-[length:var(--text-body-s)] text-secondary">Opens in your own timezone.</p>
        </section>
      ) : null}

      <SealStampsRow seals={data.seals} passphraseUnlocked={false} />

      {placeSeal && placeSeal.type === 'place' ? (
        <PlaceGate token={token} name={placeSeal.name} radiusM={placeSeal.radiusM} onSatisfied={onPlaceGate} />
      ) : identitySeal ? (
        <IdentityGate token={token} onSatisfied={onIdentityGate} />
      ) : null}

      {/*
        Recipient-requested, not re-engagement. `07 §XVI` bans anniversary
        nudges and re-engagement notification; this is the sanctioned
        "Approach" notification, asked for by the person waiting. Preserved
        exactly — only the copy is brought into voice (no tick-mark flourish,
        no exclamation).
      */}
      <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-rule)] pt-6">
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
          {remindEnabled ? 'You will be told when it opens' : 'Tell me when it opens'}
        </Button>
        {data.unlockAt ? (
          <a
            href={icsDataUrl(data.unlockAt, data.senderName)}
            download="timelycapsule.ics"
            className="text-[length:var(--text-body-s)] text-[var(--color-interactive)] underline underline-offset-4"
          >
            Add to calendar
          </a>
        ) : null}
      </div>
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
  // Decryption can genuinely fail — a truncated or edited link carries a wrong
  // key, and ciphertext can be corrupt. Without this the rejection was silent
  // and `decryptedDoc` stayed `undefined`, parking the recipient on
  // "Decrypting this capsule." forever: a loading state that never resolves,
  // which `07 §VI.3` forbids outright.
  const [decryptFailed, setDecryptFailed] = useState(false);

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
      void decryptContentDoc(data.contentDocEnc, capsuleKey)
        .then(setDecryptedDoc)
        .catch(() => setDecryptFailed(true));
      return;
    }
    if (data.passphraseSeal) return; // waiting on PassphraseGate to unwrap
    const fragmentKey = keyFromUrlFragment();
    if (!fragmentKey) return;
    const timer = setTimeout(() => {
      setCapsuleKey(fragmentKey);
      void decryptContentDoc(data.contentDocEnc!, fragmentKey)
        .then(setDecryptedDoc)
        .catch(() => setDecryptFailed(true));
    }, 0);
    return () => clearTimeout(timer);
  }, [state, data, capsuleKey]);

  if (state === 'loading') {
    return (
      // `07 §II.8` — never simulate what we can state, and `07 §XVI` bans
      // spinners and skeleton shimmer outright. A held line is the honest
      // form: it says what is happening once, and then is quiet.
      //
      // Held in the same frame the resolved page uses, so the line does not
      // sit dead-centre and then jump to a left-aligned instrument a moment
      // later. `07 §XI` asks for layout-stable placeholders; the measure and
      // the hallmark rule are what make it stable.
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-rule)] pb-4">
          <Hallmark>TimelyCapsule</Hallmark>
        </header>
        <p className="text-[length:var(--text-body-s)] text-secondary">Retrieving this capsule.</p>
      </main>
    );
  }

  if (state === '404') {
    return (
      <SystemPage
        state="Not found"
        headline="No capsule at this link."
        body="The link may be incomplete or mistyped. Ask the sender for the full one."
        cta={{ label: 'Go to TimelyCapsule', href: '/' }}
      />
    );
  }

  if (state === 'withdrawn') {
    return (
      <SystemPage
        state="Withdrawn"
        headline="This capsule was withdrawn."
        body="The sender withdrew it before it opened. Its contents were never shown."
        cta={{ label: 'Go to TimelyCapsule', href: '/' }}
      />
    );
  }

  if (state === 'expired') {
    return (
      <SystemPage
        state="Expired"
        headline="This capsule has expired."
        body="It opened, and its contents were removed on the schedule the sender set."
        cta={{ label: 'Go to TimelyCapsule', href: '/' }}
      />
    );
  }

  if (state === 'rate-limited') {
    /*
      The one state that used to stop rather than conclude: it named the
      problem and then offered nothing — no way to retry, no sense of how
      long, and no way onward, on a page reached by someone who has done
      nothing wrong but reload. Retrying is the whole of what they want, so
      it is the action; the sentence says plainly that waiting is what
      resolves it, without inventing a countdown we cannot honour.
    */
    return (
      <SystemPage
        state="Paused"
        headline="Too many attempts."
        body="This link is being opened too often. Give it a minute, then try again — nothing has happened to the capsule."
        cta={{ label: 'Try again', href: `/c/${token}${typeof window === 'undefined' ? '' : window.location.hash}` }}
      />
    );
  }

  if (state === 'locked' && data?.status === 'locked') {
    return (
      <LockedWait
        token={token}
        data={data}
        onPlaceGate={(gateToken) => setPlaceGate(gateToken)}
        onIdentityGate={(gateToken) => setIdentityGate(gateToken)}
      />
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

    /*
     * The likeliest failure on the whole recipient path: a link forwarded,
     * copied out of a preview pane, or pasted by a mail client that dropped
     * the `#k=` fragment. It was the only terminal state rendered as a bare
     * sentence rather than through `SystemPage` — no headline, no way onward —
     * despite being the one a real person is most likely to hit.
     */
    if (!capsuleKey && !data.passphraseSeal) {
      return (
        <SystemPage
          state="Key missing"
          headline="This link is missing its key."
          body="The part after the # carries the key that opens this capsule, and some apps drop it when a link is forwarded. Ask the sender for the original link."
        />
      );
    }

    // A key was supplied and it did not open this capsule.
    if (decryptFailed) {
      return (
        <SystemPage
          state="Key mismatch"
          headline="This link did not open the capsule."
          body="The key it carries does not match. It may have been shortened or edited in transit. Ask the sender for the original link."
        />
      );
    }

    if (decryptedDoc === undefined) {
      return (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-rule)] pb-4">
            <Hallmark>{data.publicId}</Hallmark>
            <Hallmark>Opening</Hallmark>
          </header>
          <p className="text-[length:var(--text-body-s)] text-secondary">Decrypting this capsule.</p>
        </main>
      );
    }

    return (
      <RevealCeremony
        token={token}
        publicId={data.publicId}
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
