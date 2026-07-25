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

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-foreground hover:brightness-95',
  secondary: 'border border-[var(--color-text-secondary)]/40 text-foreground hover:bg-[var(--color-bg-raised)]',
  ghost: 'text-foreground hover:bg-[var(--color-bg-raised)]',
  destructive: 'bg-[var(--color-danger)] text-white hover:brightness-95',
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
        'inline-flex items-center justify-center rounded-[var(--radius-input)] font-medium transition',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        children
      )}
    </button>
  );
});
