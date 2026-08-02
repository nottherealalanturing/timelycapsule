import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface RecordProps extends HTMLAttributes<HTMLElement> {
  /** Rendered element. Use `article` for a letter, `blockquote` for a quoted record. */
  as?: ElementType;
  children: ReactNode;
  /** Drops the cast shadow. Only for a record already inside another bounded surface. */
  flat?: boolean;
}

/**
 * A **record** — the second of Meridian's two registers.
 *
 * Letters, reveals, exports, emails, print, keepsakes. Paper and serif,
 * permanently, in both themes (design/05).
 *
 * Two rules govern this component, and both are load-bearing rather than
 * cosmetic. Gate 1 tested the dark→paper transition and it only read as
 * ceremony when they held (design/06):
 *
 *   1. **A record is an object, never a background.** It is bounded on all
 *      four sides with the instrument surround visible around it, at every
 *      breakpoint. The mental model is a lit document in a dark room — not a
 *      move to a light room. The moment paper becomes the page ground this
 *      is a theme toggle, immediately and irrecoverably.
 *   2. **The registers never overlap in time.** When a record replaces an
 *      instrument surface, the instrument clears first, the frame holds
 *      empty, and only then does the record arrive. Never a crossfade.
 *      Rule 2 is a sequencing concern for whoever animates the transition;
 *      this component only guarantees rule 1.
 *
 * The `.tc-record` class re-points the semantic colour tokens for the whole
 * subtree, so any primitive rendered inside — Button, Input, StateChip —
 * re-registers automatically without prop drilling.
 */
export function Record({ as, children, flat = false, className, ...props }: RecordProps) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag
      className={cn(
        'tc-record rounded-[var(--radius-record)] px-6 py-6 sm:px-8 sm:py-7',
        'text-[length:var(--text-body-l)] leading-[var(--lh-record)]',
        !flat && 'shadow-record',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
