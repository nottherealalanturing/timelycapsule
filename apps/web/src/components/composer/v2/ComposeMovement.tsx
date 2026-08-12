'use client';

import { cn } from '@tc/ui-web';
import { useCallback, useState, type ReactNode } from 'react';
import { readEnvelope, type PlaceMemory } from '../../../lib/letter-envelope';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';
import { AddressHallmark } from './AddressHallmark';
import { Enclosures } from './Enclosures';
import { MarginPrompt } from './MarginPrompt';
import { PlaceMemoryDialog } from './PlaceMemoryDialog';
import { RecordLetter } from './RecordLetter';
import type { ComposerCapabilities } from './capabilities';
import type { EnclosureController } from './use-enclosures';

export interface ComposeMovementProps {
  draft: CapsuleDraft;
  capabilities: ComposerCapabilities;
  enclosures: EnclosureController;
  /** Who the letter is for, from Address. Null for a self capsule. */
  addressee: string | null;
  opensAt: Date | null;
  tz: string;
  recipientLocal?: boolean;
  /** Rendered at the end of the document — the way out of this movement. */
  footer?: ReactNode;
  className?: string;
}

/**
 * **Movement II — Compose.**
 *
 * One surface, one job: the letter and what travels with it. Shared verbatim by
 * the authenticated composer and the guest flow, which differ only in the
 * `capabilities` handed in and in what backs the `draft`.
 *
 * Two structural decisions, both from `07 §IX`:
 *
 *   - **The address stays visible.** Who and when were settled in Address and
 *     are held above the record here, because writing into an abstraction is
 *     the thing people abandon.
 *   - **There is no sticky advance.** The way onward sits at the end of the
 *     document, so sealing is reached by deliberately travelling to it rather
 *     than by an ever-present button beside the sentence being written:
 *     *"the decision to commit must never be a side-effect of finishing a
 *     sentence."*
 *
 * On desktop the prompt occupies the margin beside the paper; below `lg` there
 * is no margin to occupy, so it moves above the record and stays dismissible.
 */
export function ComposeMovement({
  draft,
  capabilities,
  enclosures,
  addressee,
  opensAt,
  tz,
  recipientLocal = false,
  footer,
  className,
}: ComposeMovementProps) {
  const [placeOpen, setPlaceOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const envelope = readEnvelope(draft.contentDoc);

  const writeEnvelope = useCallback(
    (next: { doc?: unknown; writtenAt?: PlaceMemory | null }) => {
      const current = readEnvelope(draft.contentDoc);
      draft.setContentDoc({
        doc: next.doc ?? current.doc,
        writtenAt: next.writtenAt !== undefined ? next.writtenAt : current.writtenAt,
      });
    },
    [draft],
  );

  const onDocChange = useCallback((doc: unknown) => writeEnvelope({ doc }), [writeEnvelope]);

  return (
    <div
      className={cn('flex flex-col gap-8', className)}
      // Dropping anywhere on the movement encloses — the enhancement over the
      // explicit control, per `02 §16`. The control itself is a real button, so
      // this is never the only way in.
      onDragOver={(e) => {
        if (!capabilities.enclosures) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!capabilities.enclosures) return;
        e.preventDefault();
        setDragOver(false);
        enclosures.onFiles(e.dataTransfer.files);
      }}
    >
      <AddressHallmark addressee={addressee} opensAt={opensAt} tz={tz} recipientLocal={recipientLocal} />

      <div className="grid gap-5 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-7">
        <MarginPrompt
          addressee={addressee}
          className={cn(
            'lg:border-r lg:border-[var(--color-rule)] lg:pr-5 lg:pt-8',
            'border-b border-[var(--color-rule)] pb-4 lg:border-b-0 lg:pb-0',
          )}
        />
        <RecordLetter
          doc={envelope.doc}
          onChange={onDocChange}
          className={cn(dragOver && 'outline outline-2 outline-offset-2 outline-[var(--color-interactive)]')}
        />
      </div>

      <Enclosures
        items={enclosures.items}
        pending={enclosures.pending}
        writtenAt={envelope.writtenAt}
        capabilities={capabilities}
        onFiles={enclosures.onFiles}
        onEnclose={enclosures.onEnclose}
        onAddPlace={() => setPlaceOpen(true)}
        onRemoveMedia={enclosures.onRemoveMedia}
        onRemovePending={enclosures.onRemovePending}
        onRetryPending={enclosures.onRetryPending}
        onRemovePlace={() => writeEnvelope({ writtenAt: null })}
        onCaption={enclosures.onCaption}
        onReorder={enclosures.onReorder}
      />

      {footer}

      {capabilities.placeMemory ? (
        <PlaceMemoryDialog
          open={placeOpen}
          onOpenChange={setPlaceOpen}
          initial={envelope.writtenAt}
          onSave={(place) => writeEnvelope({ writtenAt: place })}
        />
      ) : null}
    </div>
  );
}
