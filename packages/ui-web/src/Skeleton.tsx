import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Layout-stable placeholder. Deliberately **static**.
 *
 * V1 pulsed. Meridian V2 forbids it: nothing in this product may read as
 * *loading* (design/07 §VI.3, §XVI). A pulse is the visual grammar of
 * impatience, and it is the same instinct the whole product exists to
 * refuse — we do not hurry the reader along.
 *
 * Its only job is to reserve the right amount of space so nothing shifts
 * when real content lands. If a surface genuinely needs to signal waiting,
 * that is a performance bug filed against engineering, not a design problem
 * to be decorated (design/07 §XI).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('rounded-[var(--radius-input)] bg-[var(--color-text-secondary)]/12', className)}
      {...props}
    />
  );
}
