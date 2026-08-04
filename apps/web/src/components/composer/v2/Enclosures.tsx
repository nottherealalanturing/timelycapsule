'use client';

import type { MediaItem } from '@tc/contracts';
import { cn, Hallmark } from '@tc/ui-web';
import { useEffect, useRef, useState } from 'react';
import type { PlaceMemory } from '../../../lib/letter-envelope';
import type { ComposerCapabilities } from './capabilities';

export interface UploadingItem {
  id: string;
  name: string;
  partsDone: number;
  partsTotal: number;
  error?: string;
}

export interface EnclosuresProps {
  items: MediaItem[];
  uploading: UploadingItem[];
  writtenAt: PlaceMemory | null;
  capabilities: ComposerCapabilities;
  onFiles: (files: FileList | null) => void;
  onRecord: () => void;
  onAddPlace: () => void;
  onRemoveMedia: (item: MediaItem) => void;
  onRemovePlace: () => void;
  onCaption: (item: MediaItem, caption: string) => void;
  onReorder: (item: MediaItem, direction: -1 | 1) => void;
  recording?: boolean;
  className?: string;
}

function formatBytes(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
 */
export function Enclosures({
  items,
  uploading,
  writtenAt,
  capabilities,
  onFiles,
  onRecord,
  onAddPlace,
  onRemoveMedia,
  onRemovePlace,
  onCaption,
  onReorder,
  recording = false,
  className,
}: EnclosuresProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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
  const isEmpty = items.length === 0 && uploading.length === 0 && !writtenAt;

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
              <div className="flex items-center gap-3">
                <span aria-hidden className="w-4 shrink-0 text-center font-[var(--font-mono)] text-secondary">
                  {item.kind === 'audio' ? '♪' : item.kind === 'video' ? '▤' : '▣'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-s)] text-foreground">
                  {item.caption || item.originalName}
                </span>
                <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)] text-secondary">
                  {formatBytes(item.sizeBytes)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
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

          {uploading.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2.5 text-[length:var(--text-body-s)]"
            >
              <span className="min-w-0 truncate text-foreground">{u.name}</span>
              <span
                className={cn('shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)]', u.error ? 'text-[var(--color-danger)]' : 'text-secondary')}
              >
                {/* A count of parts, not a bar. `03 §V.2` bans progress grammar;
                    this is a reading of how much has actually landed. */}
                {u.error ?? `${u.partsDone} of ${u.partsTotal}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {nothingAvailable ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-input)] border border-dashed border-[var(--color-rule-strong)] px-3 py-2.5">
          <span className="text-[length:var(--text-body-s)] text-secondary">Photographs, voice notes and places</span>
          <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary">
            {capabilities.upgradeHint}
          </span>
        </div>
      ) : (
        <div ref={menuRef} className="relative self-start">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="text-[length:var(--text-body-s)] text-[var(--color-interactive)] underline-offset-2 hover:underline"
          >
            Enclose something
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-full z-20 mt-1 w-64 rounded-[var(--radius-input)] border border-[var(--color-rule-strong)] bg-[var(--color-bg-raised)] p-1 shadow-md"
            >
              <MenuItem
                glyph="▣"
                label="A photograph, video or file"
                available={capabilities.enclosures}
                hint={capabilities.upgradeHint}
                onSelect={() => {
                  setMenuOpen(false);
                  fileRef.current?.click();
                }}
              />
              <MenuItem
                glyph="♪"
                label={recording ? 'Stop recording' : 'A voice note'}
                available={capabilities.enclosures}
                hint={capabilities.upgradeHint}
                onSelect={() => {
                  setMenuOpen(false);
                  onRecord();
                }}
              />
              <MenuItem
                glyph="⌖"
                label={writtenAt ? 'Change where this was written' : 'Where this was written'}
                available={capabilities.placeMemory}
                hint={capabilities.upgradeHint}
                onSelect={() => {
                  setMenuOpen(false);
                  onAddPlace();
                }}
              />
            </div>
          ) : null}
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

/**
 * Unavailable, not absent. `01 §4.1b` phrases guest limits as invitations
 * upward — a capability the writer never sees cannot be a reason to sign up,
 * and hiding it also means the two entry points stop looking like one product.
 */
function MenuItem({
  glyph,
  label,
  available,
  hint,
  onSelect,
}: {
  glyph: string;
  label: string;
  available: boolean;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={!available}
      title={available ? undefined : `${hint} required`}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-left text-[length:var(--text-body-s)]',
        available ? 'text-foreground hover:bg-[var(--color-bg-primary)]' : 'cursor-not-allowed text-secondary',
      )}
    >
      <span aria-hidden className="w-4 shrink-0 text-center font-[var(--font-mono)] text-secondary">
        {glyph}
      </span>
      <span className="flex-1">{label}</span>
      {!available ? (
        <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
