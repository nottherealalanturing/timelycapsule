'use client';

import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const WIDTH_CLASSES = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[800px]',
};

/** Center-modal per 02-UX-DESIGN.md §6 (480/640/800 widths, full-screen on mobile is composer-only). */
export function Dialog({ open, onOpenChange, title, description, children, width = 'sm' }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* A scrim, not a spectacle. No entrance animation: opening a dialog is
            reversible, so it belongs to the instant tier (design/07 §VI). */}
        <RadixDialog.Overlay className="fixed inset-0 bg-[color-mix(in_srgb,var(--color-bg-primary)_72%,transparent)]" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-[var(--radius-modal)] bg-[var(--color-bg-raised)] p-6 shadow-lg',
            'border border-[var(--color-rule)]',
            WIDTH_CLASSES[width],
          )}
        >
          <RadixDialog.Title className="text-[length:var(--text-title-s)] font-semibold leading-[var(--lh-heading)] text-foreground">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1.5 text-[length:var(--text-body-s)] text-secondary">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
