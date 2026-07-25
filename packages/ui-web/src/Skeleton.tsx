import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** Shimmer placeholder — never a spinner for content areas (02-UX-DESIGN.md §6). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-[var(--radius-input)] bg-[var(--color-text-secondary)]/15', className)}
      {...props}
    />
  );
}
