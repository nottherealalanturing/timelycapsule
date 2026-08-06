'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Filled surface, label always visible (never placeholder-as-label),
 * inline error below in danger — 02-UX-DESIGN.md §6.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[length:var(--text-body-s)] font-medium text-foreground">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId ?? hintId}
        className={cn(
          'motion-instant h-10 rounded-[var(--radius-input)] border px-3 text-sm text-foreground',
          'bg-[var(--color-bg-raised)] border-[var(--color-rule-strong)]',
          // V1 focused with a dusk-violet ring that V2 does not have. Focus is
          // now the interactive token. Note that `focus-visible` does not make
          // this keyboard-only: a text field always matches `:focus-visible`,
          // so the ring shows on mouse focus too — which is what we want for a
          // field you type into. One indicator; the border never also changes.
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--color-interactive)]',
          error && 'border-[var(--color-danger)]',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
