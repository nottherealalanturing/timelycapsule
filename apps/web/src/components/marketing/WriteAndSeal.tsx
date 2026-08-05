'use client';

import { Button, DualClock, DurationStamp, Hallmark, Input, MeridianApproach, Record } from '@tc/ui-web';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Horizon } from '../composer/v2/Horizon';
import { gapPhrase, horizonCandidates, reasonFor } from '../../lib/horizons';
import { browserZone } from '../../lib/zoned-time';
import { SealCeremony } from '../composer/SealCeremony';
import { TransitStage } from '../reveal/TransitStage';
import { TRANSIT_END, useTransit } from '../reveal/use-transit';
import { formatAbsoluteDate } from '../../lib/waiting';

/**
 * Sections 3 and 4 of the landing page — **Write one** and **Seal it**.
 *
 * The turn from reading to meaning it. `09 §IV` names the blank page as the
 * largest barrier in the product, and `07 §XI` says the first act is
 * composition; this puts a working composer in front of a stranger while their
 * motivation is highest.
 *
 * ── How much of the real composer this is ─────────────────────────────
 * As much as a marketing page can hold. `SealCeremony` and `Horizon` are the
 * composer's own components, imported unmodified, and the moments in the
 * Horizon come from `lib/horizons`' generator rather than a list written to
 * look like it. The letter sits in a `Record`, the same paper object Compose
 * writes on.
 *
 * What is *not* shared is `RecordLetter` itself, which binds the record to a
 * TipTap editor: this page needs neither the editor nor `useCapsuleDraft`'s
 * capsule id and live API, and putting them on the marketing path would buy a
 * visitor nothing they can see while costing all of them the bundle. A plain
 * textarea inside a real `Record` is the same register and the same object
 * with a tenth of the machinery — a shorter demonstration of the same thing,
 * which is this section's whole job.
 *
 * The line that matters: this is a *subset* of Capsule Creation V2, never a
 * parallel version of it. Anything that would drift — the ceremony, the
 * scheduling instrument, the moments, the record — is imported, not rebuilt.
 *
 * ── The horizon rule ──────────────────────────────────────────────────
 * Guest capsules are capped at 365 days (`/try`'s guest ceiling). The Horizon
 * still offers moments beyond that, because `09 §IV`'s long durations are the
 * emotional point of the product — but anything past a year routes to signup
 * rather than to `/try`, so the offer stands and only the destination changes.
 */

const DAY = 24 * 3_600_000;
const GUEST_MAX_DAYS = 365;

/** Read by `/try` on mount so the words survive the handoff. */
export const DRAFT_KEY = 'tc-landing-draft';

export function WriteAndSeal() {
  const [recipient, setRecipient] = useState('');
  const [letter, setLetter] = useState('');
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [sealedAtMs, setSealedAtMs] = useState<number | null>(null);
  const [arrivalRun, setArrivalRun] = useState(0);
  const [arriving, setArriving] = useState(false);
  // Called unconditionally: hooks cannot sit behind the sealed early-return.
  const transit = useTransit(arriving, arrivalRun);
  const arrived = arriving && transit.elapsedMs >= TRANSIT_END;

  /*
   * The same moments the real Address movement offers, from the same
   * generator — not a marketing list that happens to resemble it.
   *
   * This used to be a `<select>` of durations ("in one year", "in five
   * years"), which is exactly the lengths-over-moments shape Capsule Creation
   * V2 moved away from (`design/21 §III`). A stranger met a dropdown here and
   * then a Horizon in the product, and had no reason to think they were the
   * same act. Capped tighter than the composer's six, because this is a
   * demonstration and the section should stay short.
   */
  const [now] = useState(() => new Date());
  const tz = browserZone();
  const candidates = useMemo(() => horizonCandidates(now, tz, null, { limit: 4 }), [now, tz]);
  const [selectedAt, setSelectedAt] = useState<Date | null>(null);
  const chosen = selectedAt ?? candidates[0]?.at ?? null;

  const horizonDays = chosen ? Math.max(1, Math.round((chosen.getTime() - now.getTime()) / DAY)) : 365;
  const canSeal = letter.trim().length > 0 && chosen !== null;
  const needsAccount = horizonDays > GUEST_MAX_DAYS;
  const horizonLabel = chosen ? gapPhrase(now.getTime(), chosen.getTime()).replace(/\.$/, '').toLowerCase() : '';

  function handleSeal() {
    if (!canSeal) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ recipient: recipient.trim(), letter: letter.trim(), horizonDays }),
      );
    } catch {
      // Private-mode storage refusal must not block the ceremony.
    }
    setSealedAtMs(Date.now());
    setCeremonyOpen(true);
  }

  if (sealed && sealedAtMs !== null) {
    const opensAtMs = sealedAtMs + horizonDays * DAY;
    return (
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <Hallmark>It is waiting</Hallmark>
          <p className="max-w-[36rem] text-[length:var(--text-body)] text-secondary">
            Nothing has been sent anywhere — this one lives only in this browser tab. But this is exactly what
            the next {horizonLabel} would look like.
          </p>
        </div>

        <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-6">
          <div className="flex flex-col gap-1">
            <Hallmark>{recipient.trim() ? `For ${recipient.trim()}` : 'Unaddressed'}</Hallmark>
            <p className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)]">
              Opens {formatAbsoluteDate(new Date(opensAtMs).toISOString())}
            </p>
          </div>
          {/* Measured from the seal instant, not Date.now() — reading the clock
              during render is impure (react-hooks/purity) and would disagree
              between renders. It was sealed a moment ago, so elapsed is zero. */}
          <MeridianApproach remainingMs={horizonDays * DAY} />
          <DualClock elapsedMs={0} remainingMs={horizonDays * DAY} />
        </div>

        {/*
          The demonstration completes the loop — write → seal → wait → arrive —
          with the visitor's own words, in about a minute.

          It is compressed, and it says so. `07 §II.8` forbids simulating what
          we can state, so the caption states the real rule beside the
          compression: this capsule would really open on the date above, and
          the transition below is the same one that would run on that day.
          Nothing here misrepresents how the product behaves; it only removes
          the wait, which is the one thing a stranger cannot be asked to sit
          through.
        */}
        {arriving ? (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-primary)]">
              <TransitStage
                key={arrivalRun}
                transit={transit}
                publicId="TC-84KZQM3P"
                className="min-h-[24rem] py-10"
              >
                {/*
                  Mirrors `RecordAtRest` in `RevealCeremony`: an addressee
                  line, the body, then the franked stamp. The addressee was
                  the gap — "Who is it for?" was captured, stored in the
                  handoff draft, and then never appeared anywhere in the
                  arrival, so the visitor's own answer silently vanished
                  between writing and reading.

                  Paragraphs split on single newlines as well as blank lines:
                  splitting only on `\n{2,}` meant a letter typed with single
                  line breaks — the common case in a short textarea — arrived
                  as one undifferentiated block.

                  The reply and custody controls the real record carries are
                  deliberately absent: nothing here has a server behind it, and
                  a row of buttons that did nothing would be simulating what we
                  can state (`07 §II.8`).
                */}
                <Record as="article" className="flex flex-col gap-4">
                  <h3 className="text-[length:var(--text-body-s)] text-secondary">
                    {recipient.trim() ? `You wrote to ${recipient.trim()}.` : 'You wrote this.'}
                  </h3>
                  {letter
                    .trim()
                    .split(/\n+/)
                    .filter((para) => para.trim().length > 0)
                    .slice(0, 6)
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  <footer className="mt-4">
                    <DurationStamp elapsedMs={horizonDays * DAY} />
                  </footer>
                </Record>
              </TransitStage>
            </div>
            <p className="text-[length:var(--text-body-s)] text-secondary">
              {arrived
                ? `That is the transition that would run on ${formatAbsoluteDate(new Date(opensAtMs).toISOString())} — the wait is the only part we skipped.`
                : 'The instrument clears, the frame holds empty, then the letter arrives.'}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {!arriving || arrived ? (
            <Button
              variant={arrived ? 'ghost' : 'secondary'}
              onClick={() => {
                setArrivalRun((n) => n + 1);
                setArriving(true);
              }}
            >
              {arrived ? 'Watch it again' : 'Skip ahead and watch it arrive'}
            </Button>
          ) : null}
          <Link href={needsAccount ? '/signup' : '/try'}>
            <Button size="lg">{needsAccount ? 'Keep it for real' : 'Seal it for real — free'}</Button>
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              // The one thing "Write another" must actually do: hand back a
              // blank page. It returned to the composer with the same letter
              // and recipient still in the fields — someone who had just read
              // their own words arrive would click it and find nothing had
              // changed, sealing the identical capsule twice. The wait and
              // arrival being demonstration state was already handled below;
              // the letter and recipient were not.
              setLetter('');
              setRecipient('');
              setSealed(false);
              setSealedAtMs(null);
              setArriving(false);
            }}
          >
            Write another
          </Button>
        </div>
        {needsAccount ? (
          <p className="text-[length:var(--text-body-s)] text-secondary">
            Waits longer than a year need an account — that is the only way we can keep finding the person you
            wrote to.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <Input
        label="Who is it for?"
        placeholder="A name, or leave it blank"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      />

      <div className="flex flex-col gap-3">
        <span className="text-[length:var(--text-body-s)] font-medium text-foreground">When does it open?</span>
        <Horizon
          now={now}
          selected={chosen}
          candidates={candidates}
          onSelect={setSelectedAt}
          tz={tz}
          reason={(at) => reasonFor(at, candidates, null, tz, now)}
        />
      </div>

      {/*
        The letter is a record here too — paper, serif, bounded on all four
        sides with the instrument ground visible around it. It was a grey
        `<textarea>` on the page ground, which made the one surface the whole
        product is built around look like a form field on the very page that
        has to argue for it (`design/21 §IV`, Gate 1's rule 1).

        A plain textarea inside the record rather than the composer's TipTap
        editor: `RecordLetter` is bound to an editor this page has no use for,
        and putting that on the marketing path would buy nothing a visitor can
        see while costing every visitor the bundle. Same register, same
        object, one-tenth the machinery — a shorter demonstration of the same
        thing, which is what this section is for.
      */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="landing-letter" className="text-[length:var(--text-body-s)] font-medium text-foreground">
          The letter
        </label>
        <div className="rounded-[var(--radius-record)] bg-[var(--color-bg-primary)] p-3 sm:p-5">
          <Record as="div" className="p-0">
            {/* `resize-none`: the drag grabber a resizable textarea paints in
                its corner sits directly on the paper and reads as a control
                bolted to the record. The composer's own record has no such
                handle, and matching it matters more here than resizing does. */}
            <textarea
              id="landing-letter"
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              rows={5}
              placeholder="What do you want them to know that you might not say out loud?"
              className="motion-instant min-h-[11rem] w-full resize-none bg-transparent px-6 py-6 font-[var(--font-record)] text-[length:var(--text-body-l)] leading-[var(--lh-record)] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)] sm:px-8 sm:py-7"
            />
          </Record>
        </div>
        {/* `09 §IX`: a question produces the person's own words; a template
            produces ours. The placeholder asks, and inserts nothing. */}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={!canSeal} onClick={handleSeal}>
          Seal it
        </Button>
        <span className="text-[length:var(--text-body-s)] text-secondary">
          {canSeal ? 'Sealing is permanent. Nothing leaves this tab.' : 'Write a line first.'}
        </span>
      </div>

      <SealCeremony
        open={ceremonyOpen}
        onDone={() => {
          setCeremonyOpen(false);
          setSealed(true);
        }}
      />
    </div>
  );
}
