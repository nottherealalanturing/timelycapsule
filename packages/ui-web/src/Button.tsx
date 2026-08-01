'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

/*
 * Fills carry their own foreground token. V1 used `text-foreground` on the
 * brass fill and `text-white` on danger — 1.54:1 and 2.94:1 respectively,
 * both well under AA. Brass and danger are mid-to-light tones, so the safe
 * foreground flips with the theme; `--color-on-accent`/`--color-on-danger`
 * hold the measured value for each register (design/07 §XIII).
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-accent-gold)] text-[var(--color-on-accent)] hover:brightness-95',
  secondary: 'border border-[var(--color-rule-strong)] text-foreground hover:bg-[var(--color-bg-raised)]',
  ghost: 'text-foreground hover:bg-[var(--color-bg-raised)]',
  destructive: 'bg-[var(--color-danger)] text-[var(--color-on-danger)] hover:brightness-95',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

/** Meridian primary/secondary/ghost/destructive button — 02-UX-DESIGN.md §6. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'motion-instant inline-flex items-center justify-center rounded-[var(--radius-input)] font-medium',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      aria-busy={loading || undefined}
      {...props}
    >
      {/*
       * V1 swapped the label for a spinning ring. Two things wrong with that:
       * spinners are banned outright (design/07 §VI.3, §XVI), and replacing
       * the children stripped the button of its accessible name for exactly
       * as long as the user most needed to know what was happening.
       *
       * V2 keeps the label, disables the control, and marks it aria-busy.
       * The state is carried in text and semantics, never in motion
       * (design/07 §V.4).
       */}
      {children}
    </button>
  );
});
