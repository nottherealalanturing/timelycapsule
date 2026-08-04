'use client';

import { cn } from '@tc/ui-web';

export type Movement = 'address' | 'compose' | 'seal';

export const MOVEMENTS: { id: Movement; label: string }[] = [
  { id: 'address', label: 'Address' },
  { id: 'compose', label: 'Compose' },
  { id: 'seal', label: 'Seal' },
];

export interface MovementNavProps {
  current: Movement;
  /** Movements reachable right now. Ones ahead of the work stay unlit. */
  available: Movement[];
  onGo: (movement: Movement) => void;
  className?: string;
}

/**
 * Which movement you are in, and the way back.
 *
 * A hallmark rather than a stepper: mono, uppercase, tracked, the same idiom
 * the record uses for its own metadata. Deliberately not dots, a bar, a
 * percentage or numbering — `03 §V.2` bans progress grammar outright, and a
 * capsule being written is not a task being completed. State is carried in
 * text, which is also what Interaction Constitution 4 asks for.
 *
 * Backwards is always free. Nothing is gated and nothing is lost by returning:
 * the draft is one object being progressively addressed, not a form validated
 * in stages. Forwards is offered at the end of each movement rather than here,
 * so reaching the seal is something you travel to.
 */
export function MovementNav({ current, available, onGo, className }: MovementNavProps) {
  return (
    <nav aria-label="Movements" className={cn('flex items-center gap-2', className)}>
      {MOVEMENTS.map((m, i) => {
        const reachable = available.includes(m.id);
        const isCurrent = m.id === current;
        return (
          <span key={m.id} className="flex items-center gap-2">
            {i > 0 ? (
              <span aria-hidden className="text-[var(--color-rule-strong)]">
                ·
              </span>
            ) : null}
            <button
              type="button"
              disabled={!reachable || isCurrent}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onGo(m.id)}
              className={cn(
                'font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em]',
                isCurrent && 'text-foreground',
                !isCurrent && reachable && 'text-secondary hover:text-foreground',
                !reachable && 'cursor-default text-[var(--color-rule-strong)]',
              )}
            >
              {m.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
