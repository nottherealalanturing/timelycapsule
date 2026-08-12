'use client';

import type { MediaItem } from '@tc/contracts';
import { Button, cn, Input, Record } from '@tc/ui-web';
import Link from 'next/link';
import { useState } from 'react';
import { readEnvelope } from '../../../lib/letter-envelope';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';
import { zoneOffsetLabel } from '../../../lib/zoned-time';
import { zoneChoice } from '../../../lib/zones';
import { ConditionsPanel } from './ConditionsPanel';
import type { SealProblem } from './seal-errors';
import type { ScheduleProblem } from './schedule-validity';
import type { ComposerCapabilities } from './capabilities';

export interface SealMovementProps {
  draft: CapsuleDraft;
  capabilities: ComposerCapabilities;
  enclosures: MediaItem[];
  addressee: string | null;
  opensAt: Date | null;
  tz: string;
  recipientLocal?: boolean;
  hasRecipients: boolean;
  /** How many enclosures are still travelling — sealing would strand them. */
  enclosuresInFlight?: number;
  sealing: boolean;
  onSeal: () => void;
  /** Takes the writer to where a lapsed moment is actually fixed. */
  onGoToAddress?: () => void;
  /** Why the last seal attempt did not happen, if one did not. */
  problem?: SealProblem | null;
  /**
   * The chosen moment, read live rather than remembered.
   *
   * Seal used to block only on the *outcome* of a failed attempt, which meant
   * a capsule whose moment had quietly passed looked perfectly sealable until
   * the request came back — and then stayed unsealable afterwards, because the
   * thing that recorded the failure was also the thing that had to be cleared
   * by a successful one. Blocking on the live reading instead means the button
   * is honest before the attempt and recovers by itself after the writer picks
   * a new moment, with nothing to reset.
   */
  scheduleProblem?: ScheduleProblem | null;
  className?: string;
}

/** Paragraphs of the letter, as they will be read. */
function paragraphs(doc: unknown): string[] {
  const node = doc as { content?: { content?: { text?: string }[] }[] } | null;
  if (!node?.content) return [];
  return node.content
    .map((block) => (block.content ?? []).map((leaf) => leaf.text ?? '').join(''))
    .filter((line) => line.trim().length > 0);
}

/**
 * **Movement III — Seal.**
 *
 * Built for confidence rather than confirmation. A confirmation asks you to
 * assent to a summary — a card of four facts and a button that means *yes,
 * really*. That produces a moment of doubt and then resolves it, which is the
 * wrong shape for the most irreversible act in the product.
 *
 * Confidence is different: you are handed the finished thing, you read it, and
 * sealing follows from having seen it. So this movement *is* the record —
 * paper, serif, the letter itself, the enclosures, the address, exactly as it
 * will be received. Nothing is summarised, because a summary is what you check
 * against when you are not sure.
 *
 * It resembles the reveal deliberately (`07 §XIV` — the empty frame and the
 * record are what people remember) without being a rehearsal of it: no
 * ceremony, no transit, no animation. The writer meets the artifact once
 * before it leaves, and recognises it years later on the other side.
 *
 * The irreversibility is stated once, plainly, beside the action — `07 §IV`
 * phase 3. Not as a checkbox, not as a second dialog, not typed out for
 * confirmation. Saying a true thing once and then trusting the person is what
 * respect looks like here.
 */
export function SealMovement({
  draft,
  capabilities,
  enclosures,
  addressee,
  opensAt,
  tz,
  recipientLocal = false,
  hasRecipients,
  enclosuresInFlight = 0,
  sealing,
  onSeal,
  onGoToAddress,
  problem = null,
  scheduleProblem = null,
  className,
}: SealMovementProps) {
  const capsule = draft.capsule!;
  const envelope = readEnvelope(draft.contentDoc);
  const lines = paragraphs(envelope.doc);

  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [naming, setNaming] = useState(false);

  const sealCount = capsule.seals.length;
  const conditionsSummary = describeConditions(capsule.seals.length, capsule.expiresAfter, capsule.expiryStrict);

  const opensLine = opensAt
    ? `${opensAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: recipientLocal ? undefined : tz })} · ${opensAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: recipientLocal ? undefined : tz })}`
    : null;

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <h2 className="text-[length:var(--text-body-l)] font-medium text-foreground">Read it once more.</h2>

      {/* The bed: instrument ground visible on all four sides, so the record
          stays an object rather than becoming the page. */}
      <div className="rounded-[var(--radius-record)] bg-[var(--color-bg-primary)] p-3 sm:p-7">
        <Record as="article">
          <div className="flex flex-col gap-1">
            <span className="font-[var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
              {addressee ? `For ${addressee}` : 'For yourself'}
            </span>
            {opensLine ? (
              <span className="font-[var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                Opens {opensLine}
                {recipientLocal ? ' · their time' : ` · ${zoneChoice(tz).city} ${zoneOffsetLabel(opensAt!, tz)}`}
              </span>
            ) : null}
          </div>

          <hr className="border-0 border-t border-[var(--color-rule)]" />

          {lines.length > 0 ? (
            <div className="flex flex-col gap-3">
              {lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-[var(--color-text-secondary)]">Nothing written yet.</p>
          )}

          {enclosures.length > 0 || envelope.writtenAt ? (
            <>
              <hr className="border-0 border-t border-[var(--color-rule)]" />
              <div className="flex flex-col gap-1 font-[var(--font-mono)] text-[0.6875rem] text-[var(--color-text-secondary)]">
                <span className="uppercase tracking-[0.14em]">Enclosed</span>
                {enclosures.map((item) => (
                  <span key={item.id}>
                    {item.kind === 'audio' ? '♪' : item.kind === 'video' ? '▤' : '▣'}&nbsp;&nbsp;
                    {item.caption || item.originalName}
                  </span>
                ))}
                {envelope.writtenAt ? <span>⌖&nbsp;&nbsp;{envelope.writtenAt.name}</span> : null}
              </div>
            </>
          ) : null}
        </Record>
      </div>

      <dl className="flex flex-col">
        <Row label="Called">
          {naming ? (
            <Input
              label="A name for your own reference"
              autoFocus
              defaultValue={capsule.title ?? ''}
              onBlur={(e) => {
                draft.patch({ title: e.target.value.trim() || null });
                setNaming(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="text-left text-[length:var(--text-body-s)] text-foreground underline-offset-2 hover:underline"
            >
              {capsule.title || 'Unnamed'}
              <span className="ml-2 text-[length:var(--text-caption)] text-secondary">
                {capsule.title ? 'Rename' : 'Name it'}
              </span>
            </button>
          )}
          <span className="mt-1 block text-[length:var(--text-caption)] text-secondary">
            For finding it again{addressee ? `. ${addressee} never sees this.` : '.'}
          </span>
        </Row>

        {capabilities.conditions ? (
          <Row label="Conditions">
            <button
              type="button"
              aria-expanded={conditionsOpen}
              onClick={() => setConditionsOpen((v) => !v)}
              className="text-left text-[length:var(--text-body-s)] text-foreground underline-offset-2 hover:underline"
            >
              {conditionsSummary}
              <span className="ml-2 text-[length:var(--text-caption)] text-secondary">
                {conditionsOpen ? 'Close' : sealCount > 0 ? 'Change' : 'Add'}
              </span>
            </button>
          </Row>
        ) : null}
      </dl>

      {conditionsOpen && capabilities.conditions ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-rule)] p-4 sm:p-5">
          <ConditionsPanel draft={draft} hasRecipients={hasRecipients} recipientName={addressee} />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {enclosuresInFlight > 0 ? (
          <p role="status" className="text-[length:var(--text-body-s)] text-secondary">
            {enclosuresInFlight === 1 ? 'One enclosure is' : `${enclosuresInFlight} enclosures are`} still arriving. Sealing
            waits for them.
          </p>
        ) : null}

        <p className="border-l-2 border-[var(--color-rule-strong)] pl-4 text-[length:var(--text-body-s)] text-secondary">
          Once sealed, what is inside cannot be changed. You can withdraw it at any time before it opens.
        </p>

        {/* Stated where the decision is made, not thrown as a toast that
            leaves before it can be acted on — some of these carry the only
            way forward the writer has. */}
        {scheduleProblem ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 border-l-2 border-[var(--color-danger)] pl-4 text-[length:var(--text-body-s)]"
          >
            <p className="text-foreground">{scheduleProblem.message}</p>
            {onGoToAddress ? (
              <button
                type="button"
                onClick={onGoToAddress}
                className="text-[var(--color-interactive)] underline underline-offset-2"
              >
                Choose a new moment
              </button>
            ) : null}
          </div>
        ) : null}

        {problem && !scheduleProblem ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 border-l-2 border-[var(--color-danger)] pl-4 text-[length:var(--text-body-s)]"
          >
            <p className="text-foreground">{problem.message}</p>
            {problem.action ? (
              <Link
                href={problem.action.href}
                className="text-[var(--color-interactive)] underline underline-offset-2"
              >
                {problem.action.label}
              </Link>
            ) : null}
          </div>
        ) : null}

        <Button
          size="lg"
          fullWidth
          loading={sealing}
          // A limit already reached does not become unreached by pressing the
          // button again; leaving it live would invite a retry that cannot work.
          disabled={enclosuresInFlight > 0 || scheduleProblem !== null || problem?.retryable === false}
          onClick={onSeal}
        >
          Seal capsule
        </Button>
      </div>
    </div>
  );
}

function describeConditions(sealCount: number, expiresAfter: string | null, strict: boolean): string {
  const parts: string[] = [];
  if (sealCount > 0) parts.push(sealCount === 1 ? 'One condition' : `${sealCount} conditions`);
  if (strict) parts.push('one reading only');
  else if (expiresAfter) parts.push('expires after opening');
  return parts.length > 0 ? parts.join(' · ') : 'None beyond the date';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--color-rule)] py-3 sm:flex-row sm:items-baseline sm:gap-4 first:border-t">
      <dt className="w-32 shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary">
        {label}
      </dt>
      <dd className="m-0 flex-1">{children}</dd>
    </div>
  );
}
