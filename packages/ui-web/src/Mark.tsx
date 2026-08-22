import type { SVGProps } from 'react';
import { cn } from './cn';

export interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox'> {
  /** Rendered size in px. Below 20 the mark switches to its minimal density. */
  size?: number;
  /** Force a density instead of deriving it from `size`. */
  density?: 'primary' | 'minimal';
  /** Accessible name. Omit for decorative use alongside the wordmark. */
  title?: string;
}

/**
 * **The Transit** — the TimelyCapsule brand mark.
 *
 * A marker approaching a meridian that has a notch reserved for it. The notch
 * is exactly the marker's diameter: the marker is the size of the gap waiting
 * for it. See `design/brand/IDENTITY.md` for the full geometry.
 *
 * Rules this component enforces so call sites cannot break them:
 *
 * - **Achromatic.** It paints in `currentColor` and offers no colour prop.
 *   `05` reserves brass for *waiting* alone, and the most-repeated element in
 *   the identity is the fastest way to destroy that reservation.
 * - **Two densities.** Below 20px the primary stroke thins into invisibility
 *   and the notch closes, so it switches automatically. The segment-to-notch
 *   ratio of 2.1 : 1 is what keeps it from reading as a colon; do not retune it
 *   here — change `design/.build-brand.mjs`, which is the source of truth for
 *   every exported asset, and mirror it.
 * - **Never animates.** Institution is static (`05`). The *motif* — the same
 *   geometry at product scale — may move; this may not.
 */
export function Mark({ size = 24, density, title, className, ...props }: MarkProps) {
  const minimal = (density ?? (size < 20 ? 'minimal' : 'primary')) === 'minimal';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0', className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {minimal ? (
        <>
          <path d="M46 6V27M46 37V58" stroke="currentColor" strokeWidth={9} />
          <circle cx={19} cy={32} r={8} fill="currentColor" />
        </>
      ) : (
        <>
          <path d="M45 6V27M45 37V58" stroke="currentColor" strokeWidth={5} />
          <circle cx={22} cy={32} r={5} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export interface LockupProps {
  size?: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  /**
   * Extra classes on the wordmark `<span>` only — opt-in, so every existing
   * call site (footer, auth, app header, sidebar drawer) keeps showing the
   * full wordmark at every width unless it explicitly asks otherwise. Added
   * for the marketing header alone, which was the one place the wordmark
   * competing with the nav caused a real overflow at 375px — not a change
   * to `Lockup`'s own default behaviour.
   */
  wordmarkClassName?: string;
}

/**
 * Mark + wordmark. The gap is 1.2× the mark's width — deliberately wider than
 * the optical default, because at a normal gap the notched meridian reads as
 * punctuation attached to the word rather than as a mark (found in applied
 * testing, `design/17`).
 */
export function Lockup({ size = 28, orientation = 'horizontal', className, wordmarkClassName }: LockupProps) {
  const vertical = orientation === 'vertical';
  return (
    <span
      className={cn(
        'inline-flex items-center text-foreground',
        vertical ? 'flex-col' : 'flex-row',
        className,
      )}
      style={{ gap: vertical ? size * 0.6 : size * 1.2 }}
    >
      <Mark size={size} title="TimelyCapsule" />
      <span
        className={cn('font-semibold leading-none tracking-[-0.005em]', wordmarkClassName)}
        style={{ fontSize: size * 0.72 }}
      >
        Timely<span className="font-normal opacity-[0.62]">Capsule</span>
      </span>
    </span>
  );
}
