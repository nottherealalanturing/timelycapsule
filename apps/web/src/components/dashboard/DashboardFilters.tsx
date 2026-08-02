'use client';

import type { CapsuleState, CapsuleType } from '@tc/contracts';
import { Select, cn } from '@tc/ui-web';

const STATE_FILTERS: { label: string; value: CapsuleState | undefined }[] = [
  { label: 'All states', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Sealed', value: 'sealed' },
  { label: 'Unlocked', value: 'unlocked' },
  { label: 'Expired', value: 'expired' },
  { label: 'Withdrawn', value: 'withdrawn' },
];

export interface DashboardFiltersProps {
  stateFilter: CapsuleState | undefined;
  typeFilter: CapsuleType | undefined;
  tagFilter: string | undefined;
  favoriteOnly: boolean;
  view: 'timeline' | 'grid';
  tags: { id: string; name: string }[];
  onState: (v: CapsuleState | undefined) => void;
  onType: (v: CapsuleType | undefined) => void;
  onTag: (v: string | undefined) => void;
  onFavorite: () => void;
  onView: (v: 'timeline' | 'grid') => void;
}

/**
 * Dashboard filter bar and view switch.
 *
 * Extracted from `/home` during the Meridian V2 rebuild so it can be exercised
 * without a session — the page is auth-gated. Purely presentational; every
 * filter value and handler still lives in the page, and the query keys are
 * untouched.
 *
 * **The favourites toggle no longer turns brass when active.** V1 lit it with
 * `--color-accent-gold`, and `05` reserves brass for *waiting* alone. A
 * favourited capsule is not waiting — it is flagged. Using brass here spends
 * the one reserved meaning in the product on a filter chip.
 */
export function DashboardFilters({
  stateFilter,
  typeFilter,
  tagFilter,
  favoriteOnly,
  view,
  tags,
  onState,
  onType,
  onTag,
  onFavorite,
  onView,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Filter by state"
          value={stateFilter ?? ''}
          onChange={(e) => onState((e.target.value || undefined) as CapsuleState | undefined)}
        >
          {STATE_FILTERS.map((f) => (
            <option key={f.label} value={f.value ?? ''}>
              {f.label}
            </option>
          ))}
        </Select>

        <Select
          label="Filter by type"
          value={typeFilter ?? ''}
          onChange={(e) => onType((e.target.value || undefined) as CapsuleType | undefined)}
        >
          <option value="">All types</option>
          <option value="self">Self</option>
          <option value="personal">Someone else</option>
        </Select>

        {tags.length > 0 ? (
          <Select
            label="Filter by tag"
            value={tagFilter ?? ''}
            onChange={(e) => onTag(e.target.value || undefined)}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </Select>
        ) : null}

        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={favoriteOnly}
          className={cn(
            'motion-instant rounded-[var(--radius-input)] border px-3 py-1.5 text-[length:var(--text-body-s)]',
            favoriteOnly
              ? 'border-[var(--color-interactive)] text-foreground'
              : 'border-[var(--color-rule)] text-secondary hover:border-[var(--color-rule-strong)] hover:text-foreground',
          )}
        >
          ★ Favourites
        </button>
      </div>

      {/* Segmented switch. Both options stay visible and the selected one is
          marked with aria-pressed, so the control states itself rather than
          relying on fill alone (`07 §V.4`). */}
      <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--color-rule)] p-1">
        {(['timeline', 'grid'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={view === v}
            className={cn(
              'motion-instant rounded-[2px] px-3 py-1 text-[length:var(--text-body-s)] capitalize',
              view === v
                ? 'bg-[var(--color-bg-raised)] text-foreground'
                : 'text-secondary hover:text-foreground',
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
