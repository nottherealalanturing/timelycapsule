'use client';

import { Button, DualClock, DurationStamp, Hallmark, Input, MeridianApproach, Record, Select } from '@tc/ui-web';
import Link from 'next/link';
import { useState } from 'react';
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
 * ── Why this is not the real composer's blocks ────────────────────────
 * `LetterBlock`/`ScheduleBlock` are coupled to `useCapsuleDraft`, which needs a
 * capsule id and a live API. Using them here would mean either creating data
 * for every visitor who scrolls, or faking a draft. Instead this is built from
 * the same **primitives** the composer uses — `Input`, `Select`, `Button` — so
 * it is the same design system rendering the same controls, and it runs
 * entirely client-side. Nothing is written to any server until the visitor
 * chooses to continue.
 *
 * ── Why the seal is the real ceremony ─────────────────────────────────
 * `SealCeremony` is imported directly from the composer, unmodified. The held
 * beat is the one thing `07 §I` says we are recognised by, and a reimplemented
 * copy would drift. This is the only place a stranger can feel it.
 *
 * ── The horizon rule ──────────────────────────────────────────────────
 * Guest capsules are capped at 365 days (`/try`'s `MAX_HORIZON_MS`). Offering
 * "eighteen years" here and then handing off to a one-year cap would be a
 * promise we break in the next click, so anything beyond a year routes to
 * signup instead. `09 §IV`'s long durations are the emotional point of the
 * product, so they stay on the menu — the destination changes, not the offer.
 */

const DAY = 24 * 3_600_000;
const GUEST_MAX_DAYS = 365;

/*
 * Real guest capsules allow anything from five minutes to a year (`/try`'s
 * MIN/MAX_HORIZON_MS), so the short options here are not a marketing fiction —
 * they are the product's own range. Starting the menu at one year was what
 * made the demonstration unsatisfying: a visitor could seal something and
 * then had nothing to look forward to within the session.
 */
const HORIZONS = [
  { label: 'tomorrow', days: 1 },
  { label: 'in a month', days: 30 },
  { label: 'in one year', days: 365 },
  { label: 'in five years', days: Math.round(5 * 365.25) },
  { label: 'in ten years', days: Math.round(10 * 365.25) },
  { label: 'when they turn eighteen', days: Math.round(18 * 365.25) },
];

/** Read by `/try` on mount so the words survive the handoff. */
export const DRAFT_KEY = 'tc-landing-draft';

export function WriteAndSeal() {
  const [recipient, setRecipient] = useState('');
  const [letter, setLetter] = useState('');
  const [horizonDays, setHorizonDays] = useState(HORIZONS[2].days);
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [sealedAtMs, setSealedAtMs] = useState<number | null>(null);
  const [arrivalRun, setArrivalRun] = useState(0);
  const [arriving, setArriving] = useState(false);
  // Called unconditionally: hooks cannot sit behind the sealed early-return.
  const transit = useTransit(arriving, arrivalRun);
  const arrived = arriving && transit.elapsedMs >= TRANSIT_END;

  const canSeal = letter.trim().length > 0;
  const needsAccount = horizonDays > GUEST_MAX_DAYS;
  const horizonLabel = HORIZONS.find((h) => h.days === horizonDays)?.label ?? '';

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
            the next {horizonLabel.replace('in ', '').replace('when they turn eighteen', 'eighteen years')} would
            look like.
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
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input
          label="Who is it for?"
          placeholder="A name, or leave it blank"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[length:var(--text-body-s)] font-medium">Opens</span>
          <Select
            label="When it opens"
            value={String(horizonDays)}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
            className="h-10"
          >
            {HORIZONS.map((h) => (
              <option key={h.days} value={h.days}>
                {h.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="landing-letter"
          className="text-[length:var(--text-body-s)] font-medium text-foreground"
        >
          The letter
        </label>
        <textarea
          id="landing-letter"
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
          rows={5}
          placeholder="What do you want them to know that you might not say out loud?"
          className="motion-instant resize-y rounded-[var(--radius-input)] border border-[var(--color-rule-strong)] bg-[var(--color-bg-raised)] p-4 text-[length:var(--text-body)] leading-[var(--lh-body)] text-foreground outline-none placeholder:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-interactive)]"
        />
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
