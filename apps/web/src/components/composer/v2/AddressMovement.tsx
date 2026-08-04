'use client';

import type { Contact, Recipient } from '@tc/contracts';
import { cn } from '@tc/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { ageAt, horizonCandidates } from '../../../lib/horizons';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';
import { browserZone, dateInputValue, instantFrom, reanchor, timeInputValue, type WallClock } from '../../../lib/zoned-time';
import { AddresseeBeat } from './AddresseeBeat';
import { ExactMoment } from './ExactMoment';
import { Horizon } from './Horizon';
import { RECIPIENT_LOCAL } from './ZonePicker';
import type { ComposerCapabilities } from './capabilities';

const MIN_MS = 5 * 60 * 1000;

export interface AddressMovementProps {
  draft: CapsuleDraft;
  capabilities: ComposerCapabilities;
  recipients: Recipient[];
  contacts: Contact[];
  onAddRecipient: (input: { email?: string; phone?: string; displayName?: string }) => Promise<void>;
  onRemoveRecipient: (id: string) => void;
  recipientError?: string | null;
  footer?: ReactNode;
  className?: string;
}

/**
 * **Movement I — Address.**
 *
 * Two beats in sequence on one surface: who this is for, then when it belongs.
 * The order is the point. `07 §IX` gives exactly two levers against the blank
 * page — address the reader first, and do the arithmetic on their future age —
 * and both are unavailable if these questions sit below the editor, because by
 * then the writer has already met the blank page and made their decision about
 * whether to continue.
 *
 * The second beat only appears once the first is answered, which keeps the
 * surface to one decision at a time (Interaction Constitution 2) without
 * becoming a wizard: nothing is gated, both beats stay editable, and moving
 * backwards costs nothing.
 */
export function AddressMovement({
  draft,
  capabilities,
  recipients,
  contacts,
  onAddRecipient,
  onRemoveRecipient,
  recipientError,
  footer,
  className,
}: AddressMovementProps) {
  const capsule = draft.capsule!;
  const isSelf = capsule.type === 'self';
  const recipientLocal = capsule.unlockMode === 'recipient_local';

  // As in ScheduleBlock: in absolute mode the zone is an entry and display
  // preference rather than capsule data, because persisting it to unlockLocal
  // would opt the capsule into the scheduler's wall-clock re-resolution.
  const [zone, setZone] = useState(() => capsule.unlockLocal?.tz ?? browserZone());
  const tz = recipientLocal ? (capsule.unlockLocal?.tz ?? zone) : zone;

  // Captured once per mount. Date.now() is impure and cannot be called during
  // render; a few seconds of drift is irrelevant to a horizon measured in years.
  const [now] = useState(() => new Date());

  const selected = useMemo(() => {
    if (capsule.unlockAt) return new Date(capsule.unlockAt);
    if (capsule.unlockLocal) {
      const [y, m, d] = capsule.unlockLocal.date.split('-').map(Number);
      const [hh, mm] = capsule.unlockLocal.time.split(':').map(Number);
      if (y && m && d) return instantFrom({ year: y, month: m, day: d, hour: hh ?? 9, minute: mm ?? 0 }, capsule.unlockLocal.tz);
    }
    return null;
  }, [capsule.unlockAt, capsule.unlockLocal]);

  // The first named recipient anchors the milestone horizons. A capsule to
  // several people still gets one set of moments; offering a separate ladder
  // per recipient would turn a decision into a comparison.
  const anchor = useMemo(() => {
    const first = recipients[0];
    if (!first) return null;
    const contact = contacts.find(
      (c) => (first.email && c.email === first.email) || (first.phone && c.phone === first.phone),
    );
    const name = first.displayName || contact?.name || first.email || first.phone || null;
    if (!name) return null;
    return { name: name.split(/[\s@]/)[0]!, birthday: contact?.birthday ?? null };
  }, [recipients, contacts]);

  const candidates = useMemo(
    () => horizonCandidates(now, tz, isSelf ? null : anchor, { maxHorizonMs: capabilities.maxHorizonMs }),
    [now, tz, isSelf, anchor, capabilities.maxHorizonMs],
  );

  const ageAtUnlock = useMemo(() => {
    if (!selected || !anchor?.birthday) return null;
    return ageAt(anchor.birthday, selected, tz);
  }, [selected, anchor, tz]);

  const validationError = useMemo(() => {
    if (!selected) return null;
    const delta = selected.getTime() - now.getTime();
    if (delta < MIN_MS) return 'That moment has already passed. Choose one at least five minutes from now.';
    if (delta > capabilities.maxHorizonMs) {
      return capabilities.maxHorizonMs < 2 * 365 * 24 * 3600_000
        ? 'Guests can travel up to a year. An account goes to fifty.'
        : 'A capsule can travel up to fifty years.';
    }
    return null;
  }, [selected, now, capabilities.maxHorizonMs]);

  function commit(at: Date) {
    if (recipientLocal) {
      draft.patch({ unlockLocal: { date: dateInputValue(at, tz), time: timeInputValue(at, tz), tz } });
    } else {
      draft.patch({ unlockAt: at.toISOString() });
    }
  }

  function commitWall(wall: WallClock) {
    commit(instantFrom(wall, tz));
  }

  function changeZone(next: string) {
    if (next === RECIPIENT_LOCAL) {
      draft.patch({
        unlockMode: 'recipient_local',
        unlockLocal: selected
          ? { date: dateInputValue(selected, tz), time: timeInputValue(selected, tz), tz }
          : null,
      });
      return;
    }
    // Re-anchor: the reading the writer chose stays put and the instant moves
    // under it, because "09:00 in New York" is a different moment from "09:00
    // in Lagos".
    const moved = selected ? reanchor(selected, tz, next) : null;
    setZone(next);
    draft.patch({
      unlockMode: 'absolute',
      unlockLocal: null,
      unlockAt: moved ? moved.toISOString() : null,
    });
  }

  const answeredWho = isSelf || recipients.length > 0 || !capabilities.recipients;

  return (
    <div className={cn('flex flex-col gap-10', className)}>
      {capabilities.recipients ? (
        <AddresseeBeat
          isSelf={isSelf}
          onChangeIsSelf={(next) => draft.patch({ type: next ? 'self' : 'personal' })}
          recipients={recipients}
          contacts={contacts}
          onAdd={onAddRecipient}
          onRemove={onRemoveRecipient}
          error={recipientError}
        />
      ) : null}

      {answeredWho ? (
        <section aria-label="When it opens" className="flex flex-col gap-5">
          <h2 className="text-[length:var(--text-body-l)] font-medium text-foreground">When does it open?</h2>

          <Horizon
            now={now}
            selected={selected}
            candidates={candidates}
            onSelect={commit}
            tz={tz}
            recipientLocal={recipientLocal}
            ageAtUnlock={ageAtUnlock}
            recipientName={anchor?.name ?? null}
          />

          <ExactMoment
            value={selected}
            onChange={commitWall}
            tz={tz}
            onZoneChange={changeZone}
            recipientLocal={recipientLocal}
            allowRecipientLocal={capabilities.recipients && !isSelf}
            error={validationError}
          />

          {validationError ? (
            <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
              {validationError}
            </p>
          ) : null}
        </section>
      ) : null}

      {footer}
    </div>
  );
}
