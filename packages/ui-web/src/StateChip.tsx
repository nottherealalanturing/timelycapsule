import { cn } from './cn';

// Matches @tc/contracts' CapsuleStateSchema exactly (03-ARCHITECTURE.md §8).
// The original T-06 version of this component predated the real state
// machine (T-08) and had 'opened'/'legacy' — neither is a capsule state
// ('opened' is a per-recipient status, 'legacy' is a capsule type) — and
// was missing 'sealing'/'expired'. Fixed here since T-12's DoD requires
// every real state to be visually distinct.
export type CapsuleState = 'draft' | 'sealing' | 'sealed' | 'unlocked' | 'expired' | 'withdrawn';

const STATE_LABEL: Record<CapsuleState, string> = {
  draft: 'Draft',
  sealing: 'Sealing…',
  sealed: 'Sealed',
  unlocked: 'Unlocked',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

const STATE_COLOR_VAR: Record<CapsuleState, string> = {
  draft: '--color-state-draft',
  sealing: '--color-state-sealing',
  sealed: '--color-state-sealed',
  unlocked: '--color-state-unlocked',
  expired: '--color-state-expired',
  withdrawn: '--color-state-withdrawn',
};

export interface StateChipProps {
  state: CapsuleState;
  className?: string;
}

/** Capsule-state pill — same colors everywhere (chips, timeline dots, icons) per 02-UX-DESIGN.md §6. */
export function StateChip({ state, className }: StateChipProps) {
  const colorVar = STATE_COLOR_VAR[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium',
        // V1 pulsed on `unlocked`. Removed: it read as loading, and it
        // animated a *terminal* state — the capsule has arrived, nothing is
        // in progress (design/07 §VI.3). The label carries the state.
        className,
      )}
      style={{ color: `var(${colorVar})`, backgroundColor: `color-mix(in srgb, var(${colorVar}) 15%, transparent)` }}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', state === 'draft' && 'border border-dashed border-current bg-transparent')}
        style={state === 'draft' ? undefined : { backgroundColor: `var(${colorVar})` }}
        aria-hidden
      />
      {STATE_LABEL[state]}
    </span>
  );
}
