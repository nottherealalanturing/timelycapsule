'use client';

import { Hallmark, cn } from '@tc/ui-web';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface CapsuleObjectProps {
  publicId: string;
  /** What it is called, and whether that is a name or a description of it. */
  name: { label: string; named: boolean };
  /** A second line, where there is something the name does not already say. */
  detail?: string | null;
  /** The reading on the right — a Dual Clock, a stamp, or a stated status. */
  reading: ReactNode;
  /** Absent where there is nowhere to go, as on a received capsule with no key. */
  href?: string;
  favourite?: boolean;
  /** Context actions — reorder in a collection, restore from trash, report a sender. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * **A capsule, drawn.**
 *
 * The shell every capsule in the authenticated app is rendered through, owned
 * or received. It exists so the two cannot drift: M2 unified the owner's three
 * representations into one, and Received still drew its own — an avatar circle
 * with the sender's initial, a bold title and half a Dual Clock — so the same
 * kind of object looked like it came from a different product depending on
 * which way it was travelling.
 *
 * What differs between owned and received is *content*, not form: a received
 * capsule is identified by who it came from and has nowhere to navigate to
 * without its key. Those are props. The geometry, the hallmark, the type
 * scale and the reading's position are not.
 */
export function CapsuleObject({
  publicId,
  name,
  detail,
  reading,
  href,
  favourite,
  trailing,
  className,
}: CapsuleObjectProps) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <Hallmark>{publicId}</Hallmark>
          {favourite ? (
            <span aria-label="Favourite" className="text-[length:var(--text-caption)] text-secondary">
              ★
            </span>
          ) : null}
        </span>
        <span
          className={cn('truncate text-[length:var(--text-body)]', name.named ? 'text-foreground' : 'text-secondary')}
        >
          {name.label}
        </span>
        {detail ? <span className="truncate text-[length:var(--text-body-s)] text-secondary">{detail}</span> : null}
      </span>
      <span className="shrink-0">{reading}</span>
    </>
  );

  // `flex-1`/`basis` are confined to `sm:` on purpose. Flex basis applies to
  // the *main* axis, and below `sm` this container is a column — so an
  // unprefixed `basis-[22rem]` set a 352px minimum **height**, leaving every
  // row on a phone a mostly-empty box. Horizontally it does the job it is
  // there for: it keeps the capsule dominant so a wide `trailing` wraps to its
  // own line instead of squeezing the name to an ellipsis.
  const shell = cn(
    'flex min-w-0 flex-col gap-3 rounded-[var(--radius-input)] border px-4 py-3',
    'sm:flex-1 sm:basis-[22rem] sm:flex-row sm:items-center sm:justify-between sm:gap-6',
  );

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3', className)}>
      {href ? (
        <Link
          href={href}
          className={cn(shell, 'motion-instant border-[var(--color-rule)] hover:border-[var(--color-rule-strong)]')}
        >
          {body}
        </Link>
      ) : (
        <div className={cn(shell, 'border-[var(--color-rule)]')}>{body}</div>
      )}
      {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">{trailing}</div> : null}
    </div>
  );
}

/** A stated status, in the same slot and idiom the Dual Clock occupies. */
export function StatedReading({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <Hallmark>{label}</Hallmark>
      <span className="text-[length:var(--text-body-s)] text-secondary">{value}</span>
    </span>
  );
}
