'use client';

import { GUEST_STORAGE_ALLOWANCE_BYTES } from '@tc/contracts';
import { encryptBytes, toBase64Url } from '@tc/crypto';
import { Button, ThemeToggle, useToast } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { guestApi } from '../../lib/api-client';
import { encodeIvCiphertext } from '../../lib/capsule-crypto';
import { formatBytes } from '../../lib/enclosure-media';
import { getGuestToken, setGuestCapsule, setGuestToken } from '../../lib/guest-store';
import { DRAFT_KEY } from '../../components/marketing/WriteAndSeal';
import { AddressMovement } from '../../components/composer/v2/AddressMovement';
import { ComposeMovement } from '../../components/composer/v2/ComposeMovement';
import { MovementNav, type Movement } from '../../components/composer/v2/MovementNav';
import { SealMovement } from '../../components/composer/v2/SealMovement';
import { GUEST_CAPABILITIES } from '../../components/composer/v2/capabilities';
import { useGuestEnclosures } from '../../components/composer/v2/use-guest-enclosures';
import { firstCompletenessBlocker } from '../../components/composer/completeness';
import { describeSealFailure, type SealProblem } from '../../components/composer/v2/seal-errors';
import { describeScheduleProblem, selectedInstant } from '../../components/composer/v2/schedule-validity';
import { useCorrectedNow } from '../../lib/use-corrected-now';
import { envelopeText } from '../../lib/letter-envelope';
import { clearGuestDraft, useGuestDraft } from '../../lib/use-guest-draft';
import { browserZone } from '../../lib/zoned-time';

function textToDoc(text: string): object {
  return {
    type: 'doc',
    content: text
      .split('\n\n')
      .filter((block) => block.trim().length > 0)
      .map((block) => ({ type: 'paragraph', content: [{ type: 'text', text: block }] })),
  };
}

/**
 * The guest entry point to Capsule Creation V2 — the same three movements the
 * authenticated composer renders, backed by session storage instead of the
 * API. This used to be its own page: the letter first, the Horizon and a bare
 * title field stacked underneath, then a plain "Seal it" button with no
 * review. That put guests through a different, shorter product and skipped
 * the one thing Movement III exists for — meeting the finished capsule once
 * before it leaves. There is one Capsule Creation experience; this renders it.
 */
export default function GuestComposerPage() {
  const router = useRouter();
  const { show } = useToast();
  const [guestToken, setGuestTokenState] = useState<string | null>(null);
  const draft = useGuestDraft(guestToken);
  const enclosures = useGuestEnclosures(draft, guestToken);
  const [movement, setMovement] = useState<Movement>('address');
  const [sealing, setSealing] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [sealProblem, setSealProblem] = useState<SealProblem | null>(null);
  const [handoff, setHandoff] = useState<{ url: string; capsuleId: string } | null>(null);
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
  const { setContentDoc, patch } = draft;
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
        // Guests have no addressee beat (no account to hold recipients
        // against), so what the landing page called "who is it for" becomes
        // the capsule's own filing name — the same field Movement III's
        // "Called" row edits.
        if (carried.recipient) patch({ title: `For ${carried.recipient}` });
      } catch {
        // Malformed or unavailable storage is not worth surfacing.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [setContentDoc, patch]);

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
  // The Horizon writes the chosen instant onto the draft; validation of it
  // lives there too, so this only needs to know whether one has been chosen.
  // The same live reading the authenticated composer uses. This page had its
  // own copy of the check against `mountedAtMs` — a clock frozen when the tab
  // opened — so a guest who chose a near moment and then spent time writing
  // was told the range was fine right up until the seal request failed.
  const scheduleTarget = draft.capsule ? selectedInstant(draft.capsule) : null;
  const scheduleNowMs = useCorrectedNow(scheduleTarget);
  const scheduleProblem = describeScheduleProblem(scheduleTarget, scheduleNowMs, GUEST_CAPABILITIES.maxHorizonMs);
  const withinRange = scheduleTarget !== null && scheduleProblem === null;

  const written = envelopeText(draft.contentDoc).trim();
  const blocker = draft.capsule ? firstCompletenessBlocker(draft.capsule, written.length > 0) : 'Loading';
  const hasMoment = Boolean(draft.capsule?.unlockAt);

  // M5 — stated plainly rather than only appearing once the limit is hit.
  // 80% is a display threshold for switching from "here's the number" to
  // "here's what to do about it," not a product-decided figure; the actual
  // limit enforced server-side is the fixed 5 MB in `lib/guest-limits.ts`.
  const usedBytes = enclosures.items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
  const nearAllowance = usedBytes > GUEST_STORAGE_ALLOWANCE_BYTES * 0.8;
  const allowanceHint =
    usedBytes === 0
      ? '5 MB guest allowance'
      : nearAllowance
        ? "You're near your 5 MB guest allowance. A free account gives you 100 MB."
        : // Reused rather than a second, MB-only formatter — found by
          // actually enclosing a small test file and seeing "0.0 MB of
          // 5 MB used", which is technically correct and reads as broken.
          // The same B/KB/MB scaling every enclosure row already uses.
          `${formatBytes(usedBytes)} of 5 MB used`;

  const reachable: Movement[] = ['address'];
  if (hasMoment) reachable.push('compose');
  if (!blocker) reachable.push('seal');

  async function seal() {
    if (!guestToken || !scheduleTarget || !withinRange || written.length === 0) return;
    setSealing(true);
    setSealProblem(null);
    try {
      // Reuses the capsule and key an earlier enclosure already created
      // (M5) — or creates them fresh, right here, exactly as this always
      // did for a text-only draft. Either way the letter is encrypted with
      // the same key as anything already attached to it; there is only ever
      // one.
      const { capsuleId, recipientToken, capsuleKey } = await draft.ensureMediaCapsule();
      const { iv, ciphertext } = await encryptBytes(
        capsuleKey,
        new TextEncoder().encode(JSON.stringify(draft.envelope)),
      );
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

      // `title` is sent here too, not just at creation — a capsule created
      // early (because a photo was enclosed before the writer named it) may
      // have been titled after the fact, and this is the one guaranteed
      // patch before sealing.
      await guestApi.patchCapsule(guestToken, capsuleId, {
        title: draft.capsule?.title || undefined,
        contentDocEnc,
        unlockAt: scheduleTarget.toISOString(),
      });
      await guestApi.sealCapsule(guestToken, capsuleId);

      const capsuleKeyB64 = toBase64Url(capsuleKey);
      setGuestCapsule({ capsuleId, recipientToken, capsuleKeyB64 });

      // The draft has become a sealed capsule; leaving it in session storage
      // would re-open the composer with a letter that has already gone.
      clearGuestDraft();

      const url = `${window.location.origin}/c/${recipientToken}#k=${capsuleKeyB64}`;
      setHandoff({ url, capsuleId });
    } catch (error) {
      // Stated on the surface rather than thrown as a toast: the most common
      // real failure here (the one-capsule guest limit) carries the only way
      // forward the writer has, and a toast leaves before it can be followed.
      setSealProblem(describeSealFailure(error));
    } finally {
      setSealing(false);
    }
  }

  if (handoff) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        {/*
          `/try`'s Address movement never asks who this is for — every guest
          capsule is framed "FOR YOURSELF" from the first prompt onward (no
          recipient field exists on this page). "Now send it" told every one
          of those writers to send something they had just written to
          themselves, which read as a real snag right after sealing. Copy
          here is self-addressed to match; the guest status page's own
          "Copy link again" already avoids the same trap.
        */}
        <h1 ref={sealedHeadingRef} tabIndex={-1} className="font-[var(--font-display)] text-2xl text-foreground outline-none">
          Sealed. Now save the link.
        </h1>
        <p className="max-w-md text-secondary">
          This link is the only way to open your capsule — keep it somewhere you&apos;ll find it again. There&apos;s no
          account, so if you lose it, it&apos;s gone for good.
        </p>
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-rule)] p-3">
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

  if (draft.loading || !draft.capsule) {
    // Held back rather than mounting empty: TipTap reads `content` once at
    // initialisation, so mounting before session storage has been read would
    // give the editor a document it can never be handed the real one for.
    return <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12" aria-hidden />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Grid rather than `justify-between`: at narrow widths "No account
          needed" wrapped to three lines and ran straight into the movement
          nav below it. A fixed three-column track keeps the nav centred
          whether or not the side labels have room to show themselves. */}
      <header className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--color-rule)] bg-[var(--color-bg-primary)]/95 px-4 py-3 backdrop-blur sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* The way out, same control and same restraint as the
              authenticated composer's own "Close" — this entry point never
              had one at any width. Nothing to flush first: the guest draft
              is already persisted to session storage as it's typed, so
              leaving is just a navigation, not a save action. */}
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            Close
          </Button>
          <p className="hidden truncate font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary sm:block">
            No account needed
          </p>
        </div>
        <MovementNav current={movement} available={reachable} onGo={setMovement} className="col-start-2 justify-self-center" />
        <div className="justify-self-end">
          <ThemeToggle />
        </div>
      </header>

      {/* `w-full` is load-bearing: `mx-auto` inside a flex-column body turns off
          cross-axis stretch, so without it this shrinks to its content width. */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
        {movement === 'address' ? (
          // A stranger arriving here cold — via a landing-page CTA, not
          // mid-session — met "When does it open?" as the very first line on
          // the page, with nothing above it saying what they were making. The
          // authenticated composer can skip this: by the time someone reaches
          // it they have already signed up and know what a capsule is. A
          // guest hasn't. Kept outside AddressMovement rather than added as a
          // prop on it — this is a guest-page concern, not a change to what
          // the shared movement itself does — and shown once, on Address
          // only: the header's own "No account needed" already carries the
          // constraint on Compose and Seal, so repeating a headline there
          // would be the duplicated-decision kind of noise this pass was
          // asked to remove.
          <div className="flex flex-col gap-1 pb-8">
            <h1 className="font-[var(--font-display)] text-2xl text-foreground">Write something for later</h1>
            <p className="text-[length:var(--text-body-s)] text-secondary">
              No account needed. Up to a year out — accounts go to fifty years.
            </p>
          </div>
        ) : null}

        {movement === 'address' ? (
          <AddressMovement
            draft={draft}
            capabilities={GUEST_CAPABILITIES}
            scheduleProblem={scheduleProblem}
            recipients={[]}
            contacts={[]}
            onAddRecipient={async () => {}}
            onRemoveRecipient={() => {}}
            footer={
              <div className="flex justify-end pt-2">
                {/* Says why it cannot advance — see the matching note in
                    `Composer.tsx`. */}
                <Button onClick={() => setMovement('compose')} disabled={!hasMoment}>
                  {hasMoment ? 'Compose' : 'Choose when it opens'}
                </Button>
              </div>
            }
          />
        ) : null}

        {movement === 'compose' ? (
          <ComposeMovement
            draft={draft}
            capabilities={GUEST_CAPABILITIES}
            enclosures={enclosures}
            addressee={null}
            opensAt={scheduleTarget}
            tz={tz}
            allowanceHint={allowanceHint}
            footer={
              <div className="flex justify-end pt-2">
                <Button onClick={() => setMovement('seal')} disabled={Boolean(blocker)}>
                  {blocker ?? 'Review'}
                </Button>
              </div>
            }
          />
        ) : null}

        {movement === 'seal' ? (
          <>
            <SealMovement
              draft={draft}
              capabilities={GUEST_CAPABILITIES}
              enclosures={enclosures.items}
              enclosuresInFlight={enclosures.pending.filter((p) => p.stage !== 'failed').length}
              addressee={null}
              opensAt={scheduleTarget}
              tz={tz}
              hasRecipients={false}
              sealing={sealing}
              onSeal={() => void seal()}
              problem={sealProblem}
              scheduleProblem={scheduleProblem}
              onGoToAddress={() => setMovement('address')}
            />
            {sessionError ? (
              <p role="alert" className="pt-4 text-[length:var(--text-body-s)] text-[var(--color-danger)]">
                This capsule cannot be started right now — the connection did not go through. Your letter is kept on
                this device; reload the page to try again.
              </p>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
