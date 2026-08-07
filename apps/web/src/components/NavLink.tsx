'use client';

import Link from 'next/link';
import { cn } from '@tc/ui-web';

export interface NavLinkProps {
  href: string;
  label: string;
  active: boolean;
  /** Dismisses the drawer when navigation happens inside one. */
  onNavigate?: () => void;
  className?: string;
}

/**
 * A single navigation destination.
 *
 * V1 repeated this markup inline in three layouts with three slightly
 * different active treatments. One component, one treatment.
 *
 * The active state is carried by a **meridian rule** on the leading edge
 * rather than by a filled pill. Two reasons: the vertical reference is the
 * product's own geometry (`07 §III`, device 5), and a filled background on a
 * nav item competes with the record surfaces that are supposed to be the only
 * lit objects on screen.
 *
 * Navigation is reversible, so it belongs to the instant tier (`07 §VI`).
 */
export function NavLink({ href, label, active, onNavigate, className }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'motion-instant relative rounded-[var(--radius-input)] py-2 pl-4 pr-3',
        'text-[length:var(--text-body-s)]',
        active ? 'text-foreground' : 'text-secondary hover:text-foreground',
        className,
      )}
    >
      {/* Interactive, not brass. Brass means *waiting* and nothing else
          (`05`), and an active nav item is not waiting — using it here would
          spend the reserved meaning on chrome. */}
      <span
        aria-hidden
        className={cn(
          'motion-instant absolute left-0 top-1/2 h-4 w-px -translate-y-1/2',
          active ? 'bg-[var(--color-interactive)]' : 'bg-transparent',
        )}
      />
      {label}
    </Link>
  );
}
