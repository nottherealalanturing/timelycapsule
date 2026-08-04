'use client';

import { cn } from '@tc/ui-web';
import { useState } from 'react';
import { dateInputValue, parseWallClock, timeInputValue } from '../../../lib/zoned-time';
import { RECIPIENT_LOCAL, ZonePicker } from './ZonePicker';

export interface ExactMomentProps {
  /** The instant currently chosen, in whatever way it was chosen. */
  value: Date | null;
  onChange: (wall: { year: number; month: number; day: number; hour: number; minute: number }) => void;
  tz: string;
  onZoneChange: (zone: string) => void;
  recipientLocal: boolean;
  allowRecipientLocal: boolean;
  error?: string | null;
  className?: string;
}

/**
 * The exact instant, for when none of the offered moments is the one.
 *
 * Deliberately second. Leading with a date field would make this a scheduling
 * form, and someone who knows they want *the spring she turns eighteen* would
 * have to work out which day that is before the interface would accept it. But
 * plenty of moments are specific and personal — an anniversary, a court date,
 * the morning after an exam — and none of those can be generated, so precision
 * has to remain one disclosure away rather than absent.
 *
 * Every control reads and writes through the selected zone (`lib/zoned-time`),
 * so the field, the reading above and the stored instant cannot disagree.
 */
export function ExactMoment({
  value,
  onChange,
  tz,
  onZoneChange,
  recipientLocal,
  allowRecipientLocal,
  error,
  className,
}: ExactMomentProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="self-start text-[length:var(--text-body-s)] text-[var(--color-interactive)] underline-offset-2 hover:underline"
      >
        {open ? 'Hide the exact moment' : 'Choose an exact moment'}
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-l border-[var(--color-rule)] pl-4">
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="exact-date" className="text-[length:var(--text-caption)] font-medium text-secondary">
                Date
              </label>
              <input
                id="exact-date"
                type="date"
                value={value ? dateInputValue(value, tz) : ''}
                onChange={(e) => {
                  const wall = parseWallClock(e.target.value, value ? timeInputValue(value, tz) : '09:00');
                  if (wall) onChange(wall);
                }}
                className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="exact-time" className="text-[length:var(--text-caption)] font-medium text-secondary">
                Time
              </label>
              <input
                id="exact-time"
                type="time"
                step={900}
                value={value ? timeInputValue(value, tz) : ''}
                onChange={(e) => {
                  const base = value ?? new Date();
                  const wall = parseWallClock(dateInputValue(base, tz), e.target.value);
                  if (wall) onChange(wall);
                }}
                className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[length:var(--text-caption)] font-medium text-secondary">Where its clock hangs</span>
            <ZonePicker
              value={recipientLocal ? RECIPIENT_LOCAL : tz}
              at={value ?? new Date()}
              allowRecipientLocal={allowRecipientLocal}
              onChange={onZoneChange}
              className="max-w-sm"
            />
          </div>

          {error ? (
            <p role="alert" className="text-[length:var(--text-caption)] text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
