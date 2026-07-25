import { cn } from './cn';

export type CapsuleState = 'draft' | 'sealed' | 'unlocked' | 'opened' | 'legacy' | 'withdrawn';

const STATE_LABEL: Record<CapsuleState, string> = {
  draft: 'Draft',
  sealed: 'Sealed',
  unlocked: 'Unlocked',
  opened: 'Opened',
  legacy: 'Legacy',
  withdrawn: 'Withdrawn',
};

const STATE_COLOR_VAR: Record<CapsuleState, string> = {
  draft: '--color-state-draft',
  sealed: '--color-state-sealed',
  unlocked: '--color-state-unlocked',
  opened: '--color-state-opened',
  legacy: '--color-state-legacy',
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
        state === 'unlocked' && 'animate-pulse',
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
