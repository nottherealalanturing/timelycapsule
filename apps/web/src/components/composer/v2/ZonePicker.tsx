'use client';

import { cn } from '@tc/ui-web';
import { useEffect, useMemo, useRef, useState } from 'react';
import { browserZone, zoneOffsetLabel } from '../../../lib/zoned-time';
import { searchZones, zoneChoice } from '../../../lib/zones';

export const RECIPIENT_LOCAL = '__recipient_local__';

export interface ZonePickerProps {
  /** IANA identifier, or `RECIPIENT_LOCAL`. */
  value: string;
  onChange: (value: string) => void;
  /** The instant offsets are computed against — a zone's offset is not constant. */
  at: Date;
  /** Hidden when there is no recipient to have a local time. */
  allowRecipientLocal?: boolean;
  className?: string;
}

/**
 * Choosing where a capsule's clock hangs.
 *
 * Replaces a `<select>` carrying every IANA identifier in alphabetical order.
 * Three things are true of that control and none of them are good: the writer's
 * own zone was buried, the entries were paths rather than places, and the list
 * opened on Africa/Abidjan. What people actually want is almost always one of
 * three answers — my time, the recipient's time, or one particular city — so
 * those are what this offers, with search behind them for everything else.
 *
 * The value handed back is still the IANA identifier. Nothing downstream knows
 * this changed.
 */
export function ZonePicker({ value, onChange, at, allowRecipientLocal = true, className }: ZonePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const here = browserZone();
  const isRecipientLocal = value === RECIPIENT_LOCAL;
  const results = useMemo(() => searchZones(query), [query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /** Clearing on the way out, rather than in an effect reacting to `open`. */
  function close() {
    setOpen(false);
    setQuery('');
  }

  // Pointer-down rather than click: a click that starts inside and ends outside
  // would otherwise leave the panel open over the rest of the form.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function choose(next: string) {
    onChange(next);
    close();
  }

  const label = isRecipientLocal ? "Recipient's local time" : `${zoneChoice(value).city} · ${zoneOffsetLabel(at, value)}`;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) close();
        }}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 text-left text-[length:var(--text-body-s)] text-foreground"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-[length:var(--text-caption)] text-secondary">
          {open ? 'Close' : 'Change'}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a time zone"
          className="absolute left-0 right-0 z-30 mt-1 flex max-h-80 flex-col overflow-hidden rounded-[var(--radius-input)] border border-[var(--color-rule-strong)] bg-[var(--color-bg-raised)] shadow-md"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          <div className="flex flex-col gap-1 border-b border-[var(--color-rule)] p-2">
            <label htmlFor="zone-search" className="sr-only">
              Search for a city
            </label>
            <input
              ref={inputRef}
              id="zone-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a city — Lagos, Tokyo, New York"
              className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
            />
          </div>

          <div className="overflow-y-auto">
            {!query ? (
              <div className="flex flex-col border-b border-[var(--color-rule)] py-1">
                <ZoneRow
                  city="Use my current time zone"
                  detail={`${zoneChoice(here).city} · ${zoneOffsetLabel(at, here)}`}
                  selected={!isRecipientLocal && value === here}
                  onSelect={() => choose(here)}
                />
                {allowRecipientLocal ? (
                  <ZoneRow
                    city="Recipient's local time"
                    detail="Wherever they are when it opens"
                    selected={isRecipientLocal}
                    onSelect={() => choose(RECIPIENT_LOCAL)}
                  />
                ) : null}
              </div>
            ) : null}

            <ul className="py-1">
              {results.map((zone) => (
                <li key={zone.id}>
                  <ZoneRow
                    city={zone.city}
                    detail={`${zone.region} · ${zoneOffsetLabel(at, zone.id)}`}
                    selected={!isRecipientLocal && value === zone.id}
                    onSelect={() => choose(zone.id)}
                  />
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-3 py-3 text-[length:var(--text-body-s)] text-secondary">
                  No city by that name. Try a larger city nearby.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ZoneRow({
  city,
  detail,
  selected,
  onSelect,
}: {
  city: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left',
        'hover:bg-[var(--color-bg-primary)]',
        selected && 'bg-[var(--color-bg-primary)]',
      )}
    >
      <span className="text-[length:var(--text-body-s)] text-foreground">{city}</span>
      <span className="shrink-0 text-[length:var(--text-caption)] text-secondary">{detail}</span>
    </button>
  );
}
