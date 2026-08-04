'use client';

import * as chrono from 'chrono-node';
import { useMemo, useState } from 'react';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';
import {
  browserZone,
  dateInputValue,
  instantFrom,
  parseWallClock,
  reanchor,
  timeInputValue,
  wallClockIn,
  zoneOffsetLabel,
} from '../../lib/zoned-time';

const MIN_MS = 5 * 60 * 1000;
const MAX_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;

const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [browserZone()];
  }
})();

/**
 * Every reading below goes through `lib/zoned-time`, so the field, the summary
 * sentence and the stored instant cannot disagree — see that module's header
 * for what went wrong when they were computed independently.
 */
function summarySentence(instant: Date, tz: string, recipientLocal: boolean): string {
  const dateStr = instant.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  });
  const timeStr = instant.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const where = recipientLocal ? "recipient's local time" : `${tz}, ${zoneOffsetLabel(instant, tz)}`;
  return `Unlocks ${dateStr} at ${timeStr} (${where}).`;
}

export function ScheduleBlock({ draft }: { draft: CapsuleDraft }) {
  const capsule = draft.capsule!;
  const [nlInput, setNlInput] = useState('');
  const [nlError, setNlError] = useState<string | null>(null);

  const recipientLocal = capsule.unlockMode === 'recipient_local';

  // In absolute mode the zone is an *entry and display* preference, not capsule
  // data: once an instant is fixed, the capsule opens at that instant whatever
  // zone you read it in. It deliberately isn't persisted to `unlockLocal` —
  // the scheduler keys DST re-resolution off that column being non-null rather
  // than off `unlockMode` (`scheduler/resolver.ts`), so writing it here would
  // quietly opt absolute capsules into wall-clock rescheduling.
  const [zone, setZone] = useState(() => capsule.unlockLocal?.tz ?? browserZone());
  const tz = recipientLocal ? (capsule.unlockLocal?.tz ?? zone) : zone;

  // Recipient-local capsules carry no `unlockAt` — the instant genuinely isn't
  // determined until we know where the recipient is. The controls still need
  // something to render, so the stored wall clock is resolved against the
  // sender's chosen zone for display purposes only; nothing is written back.
  const currentDate = useMemo(() => {
    if (capsule.unlockAt) return new Date(capsule.unlockAt);
    if (capsule.unlockLocal) {
      const wall = parseWallClock(capsule.unlockLocal.date, capsule.unlockLocal.time);
      if (wall) return instantFrom(wall, capsule.unlockLocal.tz);
    }
    return null;
  }, [capsule.unlockAt, capsule.unlockLocal]);

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
        unlockLocal: { date: dateInputValue(next, tz), time: timeInputValue(next, tz), tz },
      });
    } else {
      draft.patch({ unlockAt: next.toISOString() });
    }
  }

  /** Writes a wall-clock reading, resolved against the selected zone. */
  function setWallClock(next: { year: number; month: number; day: number; hour: number; minute: number }) {
    setDateTime(instantFrom(next, tz));
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
      // chrono resolves against the browser's own zone. What the person meant
      // was a reading — "next New Year at 9am" is 9am wherever they said the
      // capsule opens — so the wall clock it produced is re-resolved against
      // the selected zone rather than its instant being taken literally.
      const local = browserZone();
      setWallClock(wallClockIn(parsed, local));
    } else {
      setNlError("Couldn't parse that — try \"in 18 months\" or a specific date");
    }
  }

  function shortcut(kind: 'next-new-year' | '+1y' | '+5y' | '+10y') {
    const here = wallClockIn(new Date(), tz);
    const at9 = { hour: 9, minute: 0 };
    switch (kind) {
      case 'next-new-year':
        setWallClock({ year: here.year + 1, month: 1, day: 1, ...at9 });
        break;
      case '+1y':
        setWallClock({ ...here, year: here.year + 1, ...at9 });
        break;
      case '+5y':
        setWallClock({ ...here, year: here.year + 5, ...at9 });
        break;
      case '+10y':
        setWallClock({ ...here, year: here.year + 10, ...at9 });
        break;
    }
  }

  return (
    <section aria-label="Schedule" className="flex flex-col gap-3">
      <h2 className="text-[length:var(--text-body-s)] font-medium text-secondary">Schedule</h2>

      <input
        aria-label="Describe when it opens"
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
          aria-label="Unlock date"
          value={currentDate ? dateInputValue(currentDate, tz) : ''}
          onChange={(e) => {
            const wall = parseWallClock(e.target.value, currentDate ? timeInputValue(currentDate, tz) : '09:00');
            if (wall) setWallClock(wall);
          }}
          className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
        />
        <input
          type="time"
          aria-label="Unlock time"
          step={900}
          value={currentDate ? timeInputValue(currentDate, tz) : ''}
          onChange={(e) => {
            const base = currentDate ?? new Date();
            const wall = parseWallClock(dateInputValue(base, tz), e.target.value);
            if (wall) setWallClock(wall);
          }}
          className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
        />
        <select
          aria-label="Time zone"
          value={recipientLocal ? '__recipient_local__' : tz}
          onChange={(e) => {
            const chosen = e.target.value;
            if (chosen === '__recipient_local__') {
              draft.patch({
                unlockMode: 'recipient_local',
                unlockLocal: currentDate
                  ? { date: dateInputValue(currentDate, tz), time: timeInputValue(currentDate, tz), tz }
                  : null,
              });
              return;
            }
            // Choosing a zone re-anchors: the reading stays put and the instant
            // moves under it, because "09:00 in New York" is a different moment
            // from "09:00 in Lagos". Previously this rewrote only the label, so
            // the capsule kept opening at the old instant while claiming the
            // new zone.
            const moved = currentDate ? reanchor(currentDate, tz, chosen) : null;
            setZone(chosen);
            draft.patch({
              unlockMode: 'absolute',
              unlockLocal: null,
              unlockAt: moved ? moved.toISOString() : null,
            });
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
