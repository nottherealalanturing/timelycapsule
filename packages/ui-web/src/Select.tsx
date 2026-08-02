'use client';

import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visually hidden but always present — a bare select has no accessible name. */
  label: string;
}

/**
 * A styled native `<select>`.
 *
 * Deliberately still a native select. The dashboard filters are reversible,
 * low-stakes controls, and the platform's own listbox is better than anything
 * we would rebuild: it is keyboard-complete, screen-reader-correct, and on
 * mobile it becomes the OS picker. `07 §V.9` requires the app to assume
 * nothing about the device, which is an argument for the native control, not
 * against it.
 *
 * What V1 got wrong was leaving it *unstyled* — three filters rendering in
 * browser chrome on an otherwise composed screen. Only the box is ours.
 *
 * The chevron is drawn rather than an icon font, and inherits `currentColor`
 * so it tracks the register.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, className, children, ...props },
  ref,
) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <select
        ref={ref}
        aria-label={label}
        className={cn(
          'motion-instant appearance-none rounded-[var(--radius-input)] border py-1.5 pl-3 pr-8',
          'border-[var(--color-rule)] bg-transparent text-[length:var(--text-body-s)] text-foreground',
          'hover:border-[var(--color-rule-strong)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-interactive)]',
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-3 h-[6px] w-[10px] text-secondary"
        fill="none"
      >
        <path d="M1 1 5 5 9 1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </span>
  );
});
