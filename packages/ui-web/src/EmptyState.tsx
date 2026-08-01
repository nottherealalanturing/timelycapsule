import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}

/** Illustration/icon + one-line headline + one CTA — 02-UX-DESIGN.md §6. */
export function EmptyState({ icon, title, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      {icon ? <div aria-hidden>{icon}</div> : null}
      <p className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)] text-foreground">{title}</p>
      {action}
    </div>
  );
}
