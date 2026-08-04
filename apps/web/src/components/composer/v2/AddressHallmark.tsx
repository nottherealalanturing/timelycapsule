'use client';

import { Hallmark } from '@tc/ui-web';

export interface AddressHallmarkProps {
  /** Who it is for. Null while a self-capsule or before a recipient is named. */
  addressee: string | null;
  /** The unlock instant, or null if not yet chosen. */
  opensAt: Date | null;
  /** Zone the date is stated in. */
  tz: string;
  /** True when the instant depends on where the recipient is. */
  recipientLocal?: boolean;
}

/**
 * Who this is for and when it opens, held above the letter while it is written.
 *
 * `07 §IX` names the blank page as the place people abandon, and gives exactly
 * two things that help: address the reader before the writing, and do the
 * arithmetic on the distance. Both are decided in Address — this keeps the
 * answer present in Compose so nobody is writing into an abstraction. It is a
 * reading, not a control; changing it means going back a movement.
 *
 * Dates are absolute (`07 §VIII.4`). A relative phrase may sit beside one but
 * never replaces it.
 */
export function AddressHallmark({ addressee, opensAt, tz, recipientLocal = false }: AddressHallmarkProps) {
  const parts: string[] = [];
  parts.push(addressee ? `For ${addressee}` : 'For yourself');

  if (opensAt) {
    const date = opensAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: recipientLocal ? undefined : tz,
    });
    parts.push(recipientLocal ? `Opens ${date}, their time` : `Opens ${date}`);
  } else {
    parts.push('No date yet');
  }

  return <Hallmark>{parts.join(' · ')}</Hallmark>;
}
