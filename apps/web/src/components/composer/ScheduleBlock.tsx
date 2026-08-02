'use client';

import * as chrono from 'chrono-node';
import { useMemo, useState } from 'react';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';

const MIN_MS = 5 * 60 * 1000;
const MAX_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;

const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone];
  }
})();

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function toTimeInputValue(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function summarySentence(date: Date, tz: string, recipientLocal: boolean): string {
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  return `Unlocks ${dateStr} at ${timeStr}${recipientLocal ? " (recipient's local time)" : ` (${tz})`}.`;
}

export function ScheduleBlock({ draft }: { draft: CapsuleDraft }) {
  const capsule = draft.capsule!;
  const [nlInput, setNlInput] = useState('');
  const [nlError, setNlError] = useState<string | null>(null);

  const recipientLocal = capsule.unlockMode === 'recipient_local';
  const tz = capsule.unlockLocal?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentDate = useMemo(() => (capsule.unlockAt ? new Date(capsule.unlockAt) : null), [capsule.unlockAt]);

  // Date.now() is impure and can't be called during render — a useState
  // lazy initializer is React's sanctioned escape hatch for exactly this
  // (same pattern as generating a stable random id in state). Captured
  // once per mount; a few seconds of drift during an editing session
  // doesn't matter for a "must be ≥5min / ≤50yr from now" bound.
  const [mountedAtMs] = useState(() => Date.now());

  const validationError = useMemo(() => {
    if (!currentDate) return null;
    const deltaMs = currentDate.getTime() - mountedAtMs;
    if (deltaMs < MIN_MS) return 'Unlock time must be at least 5 minutes from now';
    if (deltaMs > MAX_MS) return 'Unlock time must be within 50 years';
    return null;
  }, [currentDate, mountedAtMs]);

  function setDateTime(next: Date) {
    if (recipientLocal) {
      draft.patch({
        unlockLocal: { date: toDateInputValue(next), time: toTimeInputValue(next), tz },
      });
    } else {
      draft.patch({ unlockAt: next.toISOString() });
    }
  }

  function handleNaturalLanguage(value: string) {
    setNlInput(value);
    if (!value.trim()) {
      setNlError(null);
      return;
    }
    const parsed = chrono.parseDate(value);
    if (parsed) {
      setNlError(null);
      setDateTime(parsed);
    } else {
      setNlError("Couldn't parse that — try \"in 18 months\" or a specific date");
    }
  }

  function shortcut(kind: 'next-new-year' | '+1y' | '+5y' | '+10y') {
    const now = new Date();
    let next: Date;
    switch (kind) {
      case 'next-new-year':
        next = new Date(now.getFullYear() + 1, 0, 1, 9, 0);
        break;
      case '+1y':
        next = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate(), 9, 0);
        break;
      case '+5y':
        next = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate(), 9, 0);
        break;
      case '+10y':
        next = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate(), 9, 0);
        break;
    }
    setDateTime(next);
  }

  return (
    <section aria-label="Schedule" className="flex flex-col gap-3">
      <h2 className="text-[length:var(--text-body-s)] font-medium text-secondary">Schedule</h2>

      <input
        placeholder="Try &quot;in 18 months&quot; or &quot;next New Year&apos;s&quot;"
        value={nlInput}
        onChange={(e) => handleNaturalLanguage(e.target.value)}
        className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
      />
      {nlError ? <p className="text-[length:var(--text-caption)] text-[var(--color-danger)]">{nlError}</p> : null}

      <div className="flex flex-wrap gap-2 text-[length:var(--text-body-s)]">
        <button type="button" onClick={() => shortcut('next-new-year')} className="rounded-full border border-[var(--color-rule-strong)] px-3 py-1 text-secondary">
          Next New Year
        </button>
        <button type="button" onClick={() => shortcut('+1y')} className="rounded-full border border-[var(--color-rule-strong)] px-3 py-1 text-secondary">
          +1 year
        </button>
        <button type="button" onClick={() => shortcut('+5y')} className="rounded-full border border-[var(--color-rule-strong)] px-3 py-1 text-secondary">
          +5 years
        </button>
        <button type="button" onClick={() => shortcut('+10y')} className="rounded-full border border-[var(--color-rule-strong)] px-3 py-1 text-secondary">
          +10 years
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={currentDate ? toDateInputValue(currentDate) : ''}
          onChange={(e) => {
            const base = currentDate ?? new Date();
            const [y, m, d] = e.target.value.split('-').map(Number);
            const next = new Date(base);
            next.setFullYear(y!, m! - 1, d);
            setDateTime(next);
          }}
          className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
        />
        <input
          type="time"
          step={900}
          value={currentDate ? toTimeInputValue(currentDate) : ''}
          onChange={(e) => {
            const base = currentDate ?? new Date();
            const [h, min] = e.target.value.split(':').map(Number);
            const next = new Date(base);
            next.setHours(h!, min!, 0, 0);
            setDateTime(next);
          }}
          className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
        />
        <select
          value={recipientLocal ? '__recipient_local__' : tz}
          onChange={(e) => {
            if (e.target.value === '__recipient_local__') {
              draft.patch({
                unlockMode: 'recipient_local',
                unlockLocal: currentDate ? { date: toDateInputValue(currentDate), time: toTimeInputValue(currentDate), tz } : null,
              });
            } else {
              draft.patch({ unlockMode: 'absolute', unlockLocal: null, unlockAt: currentDate?.toISOString() ?? null });
            }
          }}
          className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
        >
          <option value="__recipient_local__">Recipient&apos;s local time</option>
          {TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-[length:var(--text-body-s)] text-secondary">
        <input
          type="checkbox"
          checked={Boolean(capsule.recurrence)}
          onChange={(e) => draft.patch({ recurrence: e.target.checked ? { freq: 'yearly' } : null })}
        />
        Repeat yearly
      </label>

      {currentDate ? (
        <p className="text-[length:var(--text-body-s)] text-foreground">{summarySentence(currentDate, tz, recipientLocal)}</p>
      ) : (
        <p className="text-[length:var(--text-body-s)] text-secondary">No unlock date set yet.</p>
      )}
      {validationError ? <p className="text-[length:var(--text-caption)] text-[var(--color-danger)]">{validationError}</p> : null}
    </section>
  );
}
