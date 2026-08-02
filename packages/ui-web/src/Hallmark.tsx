import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface HallmarkProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/**
 * A **hallmark** — mono, uppercase, tracked metadata.
 *
 * The third typographic role in Pairing C (design/05 §Typography): serif for
 * records, sans for instruments, mono for hallmarks and metadata. Public
 * ids, sealed dates, durations, field labels on an instrument face.
 *
 * A hallmark is a mark struck into an object to certify it — assay marks on
 * silver, a maker's stamp. That is exactly the job here: it states a fact
 * about the record without being part of the record's content, which is why
 * it never carries the serif and never grows to reading size.
 *
 * It reads in whichever register it sits in, because it takes its colour
 * from the semantic layer rather than a fixed value. Inside a `Record` it is
 * record-muted; on an instrument face it is instrument-muted.
 */
export function Hallmark({ children, className, ...props }: HallmarkProps) {
  return (
    <span
      className={cn(
        'font-[family-name:var(--font-mono)] uppercase tabular-nums text-secondary',
        'text-[length:var(--text-hallmark)] tracking-[var(--tracking-hallmark)]',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
