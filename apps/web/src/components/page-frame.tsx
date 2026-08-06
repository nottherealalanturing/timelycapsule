import { cn } from '@tc/ui-web';

/**
 * The authenticated page frame — measure, gutter and rhythm, defined once.
 *
 * Every page behind the login supplied its own `px-8 py-10` wrapper, twenty
 * copies of the same decision, and that produced two drifts:
 *
 * 1. **No measure.** Nothing bounded the content, so rows ran the full width
 *    of the viewport and a capsule's Dual Clock ended up roughly 1200px from
 *    the title it belongs to. `--measure-app` bounds the scan; the reasoning
 *    is on the token.
 * 2. **A gutter that only worked on a desktop.** `px-8` never narrowed on a
 *    phone and never grew on a wide monitor. The scale here is Capsule
 *    Creation V2's.
 *
 * A class rather than a wrapper component on purpose: pages already have an
 * outer element, and swapping a `className` leaves their structure — and
 * their diffs — untouched. Layout shells that manage their own panes
 * (settings) opt out and keep their own padding.
 */
export function appFrame(...extra: (string | false | undefined)[]): string {
  return cn(
    'mx-auto w-full max-w-[var(--measure-app)] px-5 py-8 sm:px-8 sm:py-10',
    ...extra,
  );
}

/**
 * A page's own name.
 *
 * Seven pages set this in `--font-display`, which is a `@deprecated` alias
 * for `--font-record` — the *record* serif, applied to instrument chrome. A
 * page name is navigation, not an artifact, so it takes the instrument sans
 * at `--text-title`, which is what `/home` already did. That is the Two
 * Registers rule (`05`), not a preference between two fonts.
 */
export function PageTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={cn('text-[length:var(--text-title)] leading-[var(--lh-heading)] text-foreground', className)}>
      {children}
    </h1>
  );
}
