'use client';

import type { MediaItem } from '@tc/contracts';
import { Button, cn, Hallmark } from '@tc/ui-web';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../../../lib/enclosure-media';
import type { PlaceMemory } from '../../../lib/letter-envelope';
import type { ComposerCapabilities } from './capabilities';
import { stageReading, type PendingEnclosure } from './enclosure-lifecycle';
import { VoiceRecorder } from './VoiceRecorder';

/** The first-visit hint, built from what this entry point can actually offer rather than assumed. */
function enclosureKindsHint(capabilities: ComposerCapabilities): string {
  const kinds: string[] = [];
  if (capabilities.enclosures) kinds.push('a photo', 'a voice note');
  if (capabilities.placeMemory) kinds.push('where you wrote this');
  if (kinds.length === 0) return '';
  if (kinds.length === 1) return kinds[0]!;
  return `${kinds.slice(0, -1).join(', ')}, or ${kinds[kinds.length - 1]}`;
}

export interface EnclosuresProps {
  items: MediaItem[];
  pending: PendingEnclosure[];
  writtenAt: PlaceMemory | null;
  capabilities: ComposerCapabilities;
  onFiles: (files: FileList | null) => void;
  onEnclose: (file: File) => void;
  onAddPlace: () => void;
  onRemoveMedia: (item: MediaItem) => void;
  onRemovePending: (id: string) => void;
  onRetryPending: (id: string) => void;
  onRemovePlace: () => void;
  onCaption: (item: MediaItem, caption: string) => void;
  onReorder: (item: MediaItem, direction: -1 | 1) => void;
  /**
   * Stated remaining-allowance text (M5) — undefined for every entry point
   * that has no allowance to state, which is every one of them except
   * Guest. Passed as a single ready-made string rather than raw numbers so
   * this component makes no assumptions about whose limit it is or how
   * close is "near" — that policy lives entirely at the call site.
   */
  allowanceHint?: string | null;
  className?: string;
}

/**
 * Things that travel with the letter.
 *
 * V1 had three separate regions for this — a dashed drop zone, a bordered
 * recorder strip, and a map buried in the Seals accordion — which is three
 * places to look for one idea. A file, a voice note and a place are all things
 * you *enclose*, so there is one action and it offers three kinds.
 *
 * The drop zone is gone as the primary control. It was a `div` with a click
 * handler and no role, which meant a keyboard user could not reach it at all;
 * dragging survives as an enhancement on the container, which is how `02 §16`
 * specifies it anyway.
 *
 * Enclosures sit outside the record, in the instrument register. They are
 * attached to the letter rather than part of it, and keeping them off the paper
 * leaves the writing surface clean.
 *
 * Unavailable kinds are omitted rather than shown disabled with an upgrade
 * label. A row that exists to advertise what a plan cannot do reads as a
 * paywall inside the writing surface, and the guest flow should feel complete
 * on its own rather than a preview of a better product — the natural moment
 * to learn what an account adds is at account creation, not mid-letter.
 */
export function Enclosures({
  items,
  pending,
  writtenAt,
  capabilities,
  onFiles,
  onEnclose,
  onAddPlace,
  onRemoveMedia,
  onRemovePending,
  onRetryPending,
  onRemovePlace,
  onCaption,
  onReorder,
  allowanceHint,
  className,
}: EnclosuresProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [captioning, setCaptioning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const nothingAvailable = !capabilities.enclosures && !capabilities.placeMemory;
  const isEmpty = items.length === 0 && pending.length === 0 && !writtenAt && !recorderOpen;

  // Nothing enclosed and nothing enclosable — the whole section is omitted
  // rather than left as an empty shell announcing a limit.
  if (nothingAvailable && isEmpty) return null;

  return (
    <section aria-label="Enclosures" className={cn('flex flex-col gap-3', className)}>
      <Hallmark>Enclosed</Hallmark>

      {isEmpty ? null : (
        <ul className="flex flex-col gap-1.5">
          {writtenAt ? (
            <EnclosureRow
              glyph="⌖"
              name={writtenAt.name}
              detail="Where this was written"
              onRemove={onRemovePlace}
              removeLabel={`Remove ${writtenAt.name}`}
            />
          ) : null}

          {items.map((item, index) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2.5">
              {/* Wraps rather than truncates. On a phone the single-line row
                  squeezed every name to three characters and an ellipsis —
                  "voice-r…", "a-ph…" — which is the one thing on the row a
                  writer actually needs to recognise. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span aria-hidden className="w-4 shrink-0 text-center font-[var(--font-mono)] text-secondary">
                  {item.kind === 'audio' ? '♪' : item.kind === 'video' ? '▤' : '▣'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-s)] text-foreground">
                  {item.caption || item.originalName}
                </span>
                <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)] text-secondary">
                  {formatBytes(item.sizeBytes)}
                </span>
                <div className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:justify-end">
                  <RowAction label="Move up" disabled={index === 0} onClick={() => onReorder(item, -1)}>
                    ↑
                  </RowAction>
                  <RowAction label="Move down" disabled={index === items.length - 1} onClick={() => onReorder(item, 1)}>
                    ↓
                  </RowAction>
                  <button
                    type="button"
                    onClick={() => setCaptioning((c) => (c === item.id ? null : item.id))}
                    aria-expanded={captioning === item.id}
                    className="px-1 text-[length:var(--text-caption)] text-[var(--color-interactive)]"
                  >
                    {item.caption ? 'Edit note' : 'Add note'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveMedia(item)}
                    aria-label={`Remove ${item.originalName}`}
                    className="px-1 text-[length:var(--text-caption)] text-secondary"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {captioning === item.id ? (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`caption-${item.id}`}
                    className="text-[length:var(--text-caption)] font-medium text-secondary"
                  >
                    A note about this
                  </label>
                  <input
                    id={`caption-${item.id}`}
                    autoFocus
                    defaultValue={item.caption ?? ''}
                    onBlur={(e) => {
                      onCaption(item, e.target.value);
                      setCaptioning(null);
                    }}
                    className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-2 py-1.5 text-[length:var(--text-body-s)] text-foreground"
                  />
                </div>
              ) : null}
            </li>
          ))}

          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2.5 text-[length:var(--text-body-s)]"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>

              {/*
                One reading for every kind of enclosure, at every step. A
                counted set of parts where there is more than one, and a named
                stage otherwise — never a bar, which `03 §V.2` reserves for
                nothing in this product, and never a spinner (`07 §XVI`).
              */}
              <span
                className={cn(
                  'shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)]',
                  p.stage === 'failed' ? 'text-[var(--color-danger)]' : 'text-secondary',
                )}
              >
                {stageReading(p)}
              </span>

              {p.stage === 'failed' ? (
                <span className="flex shrink-0 items-center gap-1">
                  {/* A stopped enclosure is recoverable where the file is
                      still in hand — a network blip should not cost the
                      writer the trouble of finding it again. */}
                  {p.file ? (
                    <button
                      type="button"
                      onClick={() => onRetryPending(p.id)}
                      className="px-1 text-[length:var(--text-caption)] text-[var(--color-interactive)]"
                    >
                      Try again
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemovePending(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="px-1 text-[length:var(--text-caption)] text-secondary"
                  >
                    Remove
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {recorderOpen ? (
        <VoiceRecorder onAccept={onEnclose} onCancel={() => setRecorderOpen(false)} />
      ) : null}

      {nothingAvailable ? null : (
        <div className="flex flex-col gap-2">
          {/*
            First-visit context only — once something's enclosed, the list
            above already shows what kinds exist, and repeating this line
            would be the duplicated-decision noise this composer pass keeps
            cutting elsewhere. Stated, not implied by a bare "+", per the
            brief: optional, and there's more than one kind.

            Built from capabilities rather than a fixed sentence (M5) — every
            entry point before Guest had `enclosures` and `placeMemory`
            either both on or both off, so one hardcoded string ("a photo, a
            voice note, or where you wrote this") was always accurate.
            Guest is the first to have one without the other, and the old
            string would have promised a place-memory control that isn't
            there — found by actually looking at the guest composer, not
            just by reasoning about the capability flags.
          */}
          {isEmpty ? (
            <p className="text-[length:var(--text-caption)] text-secondary">Optional — {enclosureKindsHint(capabilities)}.</p>
          ) : null}
          {/* Stated plainly rather than only surfacing once the limit is
              actually hit — Guest's whole design is "you can do this now,
              an account gives you more room," not a wall that appears
              without warning. */}
          {allowanceHint ? (
            <p className="text-[length:var(--text-caption)] text-secondary">{allowanceHint}</p>
          ) : null}
          <div ref={menuRef} className="relative self-start">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span aria-hidden className="mr-1.5 font-[var(--font-mono)]">
                +
              </span>
              Enclose something
            </Button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full z-20 mt-1 w-64 rounded-[var(--radius-input)] border border-[var(--color-rule-strong)] bg-[var(--color-bg-raised)] p-1 shadow-md"
              >
                {/* Only offered kinds this entry point actually supports —
                    see the note above on why an unavailable kind is omitted
                    rather than shown disabled. */}
                {capabilities.enclosures ? (
                  <>
                    <MenuItem
                      glyph="▣"
                      label="A photograph, video or file"
                      onSelect={() => {
                        setMenuOpen(false);
                        fileRef.current?.click();
                      }}
                    />
                    <MenuItem
                      glyph="♪"
                      label="A voice recording"
                      onSelect={() => {
                        setMenuOpen(false);
                        setRecorderOpen(true);
                      }}
                    />
                  </>
                ) : null}
                {capabilities.placeMemory ? (
                  <MenuItem
                    glyph="⌖"
                    label={writtenAt ? 'Change where this was written' : 'Where this was written'}
                    onSelect={() => {
                      setMenuOpen(false);
                      onAddPlace();
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </section>
  );
}

/** A non-file enclosure — currently only place-as-memory. */
function EnclosureRow({
  glyph,
  name,
  detail,
  onRemove,
  removeLabel,
}: {
  glyph: string;
  name: string;
  detail: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2.5">
      <span aria-hidden className="w-4 shrink-0 text-center font-[var(--font-mono)] text-secondary">
        {glyph}
      </span>
      <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-s)] text-foreground">{name}</span>
      <span className="shrink-0 text-[length:var(--text-caption)] text-secondary">{detail}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="shrink-0 px-1 text-[length:var(--text-caption)] text-secondary"
      >
        Remove
      </button>
    </li>
  );
}

function RowAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="px-1 text-secondary disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MenuItem({
  glyph,
  label,
  onSelect,
}: {
  glyph: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-left text-[length:var(--text-body-s)] text-foreground hover:bg-[var(--color-bg-primary)]"
    >
      <span aria-hidden className="w-4 shrink-0 text-center font-[var(--font-mono)] text-secondary">
        {glyph}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
