'use client';

import { encryptBytes, generateCapsuleKey, toBase64Url } from '@tc/crypto';
import { Button, Input, useToast } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { guestApi } from '../../lib/api-client';
import { encodeIvCiphertext } from '../../lib/capsule-crypto';
import { getGuestToken, setGuestCapsule, setGuestToken } from '../../lib/guest-store';
import { DRAFT_KEY } from '../../components/marketing/WriteAndSeal';
import { ComposeMovement } from '../../components/composer/v2/ComposeMovement';
import { GUEST_CAPABILITIES } from '../../components/composer/v2/capabilities';
import { noEnclosures } from '../../components/composer/v2/use-enclosures';
import { envelopeText } from '../../lib/letter-envelope';
import { clearGuestDraft, useGuestDraft } from '../../lib/use-guest-draft';
import { browserZone, dateInputValue, instantFrom, parseWallClock, timeInputValue } from '../../lib/zoned-time';

function textToDoc(text: string): object {
  return {
    type: 'doc',
    content: text
      .split('\n\n')
      .filter((block) => block.trim().length > 0)
      .map((block) => ({ type: 'paragraph', content: [{ type: 'text', text: block }] })),
  };
}

const MIN_HORIZON_MS = 5 * 60 * 1000;

/** A day out, in the writer's own zone — not UTC, which the old default sliced. */
function defaultUnlock(): { date: string; time: string } {
  const at = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tz = browserZone();
  return { date: dateInputValue(at, tz), time: timeInputValue(at, tz) };
}

export default function GuestComposerPage() {
  const router = useRouter();
  const { show } = useToast();
  const draft = useGuestDraft();
  const [guestToken, setGuestTokenState] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [{ date, time }, setDateTime] = useState(defaultUnlock());
  const [sealing, setSealing] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [handoff, setHandoff] = useState<{ url: string; capsuleId: string } | null>(null);
  const [mountedAtMs] = useState(() => Date.now());
  const sealedHeadingRef = useRef<HTMLHeadingElement>(null);

  // Same pattern as the reveal's `RecordAtRest` heading: without this, sealing
  // silently left focus wherever the "Seal it" button used to be (removed from
  // the DOM by this same state change), giving a screen-reader user no
  // announcement that anything happened at all (design/07 §XIII).
  useEffect(() => {
    if (handoff) sealedHeadingRef.current?.focus();
  }, [handoff]);

  // Carry over anything written on the landing page, so the words survive the
  // handoff instead of the visitor retyping them. Deferred like every other
  // effect here — an effect body must not call setState synchronously.
  const { setContentDoc } = draft;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        sessionStorage.removeItem(DRAFT_KEY);
        const carried = JSON.parse(raw) as { recipient?: string; letter?: string };
        if (carried.letter) {
          setContentDoc({ doc: textToDoc(carried.letter), writtenAt: null });
        }
        if (carried.recipient) setTitle(`For ${carried.recipient}`);
      } catch {
        // Malformed or unavailable storage is not worth surfacing.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [setContentDoc]);

  useEffect(() => {
    const existing = getGuestToken();
    const timer = setTimeout(() => {
      if (existing) {
        setGuestTokenState(existing);
        return;
      }
      // Without a catch this rejected silently and left "Seal it" disabled with
      // nothing said — the writer would finish a letter and find no way to send
      // it. Interaction Constitution 10: state what happened and what happens
      // next.
      void guestApi
        .createSession()
        .then((res) => {
          setGuestToken(res.guestToken);
          setGuestTokenState(res.guestToken);
        })
        .catch(() => setSessionError(true));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const tz = browserZone();
  const wall = parseWallClock(date, time);
  const unlockAt = wall ? instantFrom(wall, tz) : null;
  const horizonMs = unlockAt ? unlockAt.getTime() - mountedAtMs : null;
  const horizonError =
    horizonMs === null
      ? null
      : horizonMs < MIN_HORIZON_MS
        ? 'Unlock time must be at least 5 minutes from now'
        : horizonMs > GUEST_CAPABILITIES.maxHorizonMs
          ? 'Guests can travel up to a year — accounts go to 50'
          : null;

  const written = envelopeText(draft.contentDoc).trim();

  async function seal() {
    if (!guestToken || !unlockAt || horizonError || written.length === 0) return;
    setSealing(true);
    try {
      const created = await guestApi.createCapsule(guestToken, { title: title || undefined });
      const capsuleKey = generateCapsuleKey();
      // The guest's letter is encrypted here rather than continuously, because
      // a guest has no master key to wrap a capsule key under until this point.
      const { iv, ciphertext } = await encryptBytes(
        capsuleKey,
        new TextEncoder().encode(JSON.stringify(draft.envelope)),
      );
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

      await guestApi.patchCapsule(guestToken, created.id, { contentDocEnc, unlockAt: unlockAt.toISOString() });
      await guestApi.sealCapsule(guestToken, created.id);

      const capsuleKeyB64 = toBase64Url(capsuleKey);
      setGuestCapsule({ capsuleId: created.id, recipientToken: created.recipientToken!, capsuleKeyB64 });

      // The draft has become a sealed capsule; leaving it in session storage
      // would re-open the composer with a letter that has already gone.
      clearGuestDraft();

      const url = `${window.location.origin}/c/${created.recipientToken}#k=${capsuleKeyB64}`;
      setHandoff({ url, capsuleId: created.id });
    } catch {
      show('Something went wrong sealing your capsule. Try again.');
    } finally {
      setSealing(false);
    }
  }

  if (handoff) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 ref={sealedHeadingRef} tabIndex={-1} className="font-[var(--font-display)] text-2xl text-foreground outline-none">
          Sealed. Now send it.
        </h1>
        <p className="max-w-md text-secondary">
          This link is the only way to open your capsule — copy it now and send it yourself. There&apos;s no account, so
          if you lose it, it&apos;s gone for good.
        </p>
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 p-3">
          <code className="break-all text-xs text-secondary">{handoff.url}</code>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(handoff.url);
              show('Link copied');
            }}
          >
            Copy link
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/try/capsule/${handoff.capsuleId}`)}>
            Continue
          </Button>
        </div>
      </main>
    );
  }

  return (
    // `w-full` is load-bearing: `mx-auto` inside the flex-column body turns off
    // cross-axis stretch, so without it this shrinks to its content width.
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">Write something for later</h1>
        <p className="text-sm text-secondary">No account needed. One capsule, up to a year out.</p>
      </div>

      {/* The same movement the signed-in composer renders. Only the
          capabilities differ — see components/composer/v2/capabilities.ts.

          Held back until the draft has been restored, because TipTap reads
          `content` once at initialisation: mounting before session storage has
          been read gives the editor an empty document it will never replace,
          and a guest who reloads mid-letter loses the letter. */}
      {draft.loading ? (
        <div className="min-h-[22rem] rounded-[var(--radius-record)] bg-[var(--color-bg-primary)]" aria-hidden />
      ) : (
        <ComposeMovement
          draft={draft}
          capabilities={GUEST_CAPABILITIES}
          enclosures={noEnclosures()}
          addressee={null}
          opensAt={unlockAt}
          tz={tz}
        />
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="try-unlock-date" className="text-sm font-medium text-secondary">
          When it opens
        </label>
        <div className="flex gap-3">
          <input
            id="try-unlock-date"
            type="date"
            value={date}
            onChange={(e) => setDateTime((s) => ({ ...s, date: e.target.value }))}
            className="rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 text-foreground"
          />
          <input
            type="time"
            aria-label="Unlock time"
            value={time}
            onChange={(e) => setDateTime((s) => ({ ...s, time: e.target.value }))}
            className="rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 text-foreground"
          />
        </div>
        <p className="text-xs text-secondary">Guests can travel up to a year — accounts go to 50.</p>
        {horizonError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {horizonError}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <Input label="Title (optional)" placeholder="Name this capsule…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-xs text-secondary">For your own reference. Recipients never see it.</p>
      </section>

      {sessionError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          This capsule cannot be started right now — the connection did not go through. Your letter is kept on this
          device; reload the page to try again.
        </p>
      ) : null}

      <Button size="lg" onClick={() => void seal()} loading={sealing} disabled={!guestToken || !!horizonError || written.length === 0}>
        Seal it
      </Button>
    </main>
  );
}
