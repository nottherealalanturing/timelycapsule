'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

/**
 * A consent or acknowledgement control.
 *
 * V1 used bare `<input type="checkbox">`, which renders in the browser's own
 * accent colour and ignores the design system entirely — on the terms
 * agreement and the recovery-code acknowledgement, both of which are consent
 * moments the user is expected to take seriously.
 *
 * The native input stays in the DOM and keeps every behaviour that matters
 * (keyboard, form participation, `required`, screen-reader semantics); it is
 * visually hidden and a styled box is drawn in its place, so the control is
 * ours to look at and the platform's to operate.
 *
 * Checked state uses the interactive token, never brass — ticking a box is not
 * waiting (`05`).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'motion-instant pointer-events-none inline-flex h-4 w-4 items-center justify-center',
            'rounded-[2px] border border-[var(--color-rule-strong)] text-[var(--color-on-accent)]',
            'peer-checked:border-[var(--color-interactive)] peer-checked:bg-[var(--color-interactive)]',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
            'peer-focus-visible:outline-[var(--color-interactive)]',
            'peer-disabled:opacity-40',
            // `peer-checked:` only reaches siblings of the peer, so the tick is
            // targeted through this span rather than styled on the svg itself.
            'peer-checked:[&>svg]:opacity-100',
          )}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0" fill="none">
            <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
      </span>
      <label htmlFor={inputId} className="cursor-pointer text-[length:var(--text-body-s)] text-secondary">
        {label}
      </label>
    </div>
  );
});
