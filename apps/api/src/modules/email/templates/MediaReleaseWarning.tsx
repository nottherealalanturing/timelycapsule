import { EmailButton, EmailLayout, EmailReading, emailColors } from './Layout.js';

export interface MediaReleaseWarningProps {
  capsuleTitle: string | null;
  daysUntilRelease: number;
  releaseAtIso: string;
  capsuleUrl: string;
}

function daysLabel(days: number): string {
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

/** `07 §VIII` rule 4 — the literal date always appears; relative time may accompany it, never replace it. */
function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The 30-day and 7-day notice before a capsule's enclosures are released
 * from storage (M4).
 *
 * **Nothing here is capsule content.** No letter text, no replies, no
 * filenames, no captions, no thumbnails — only the owner's own title for
 * the capsule, the date, and what they can do. That is not a stylistic
 * choice: the server cannot read any of the rest, and an email is precisely
 * where a leak would be permanent and unrecallable.
 *
 * The tone matters as much as the facts. This is not a dunning notice and
 * must never read as one — nothing is being taken away as leverage, and the
 * letter itself is not going anywhere. It says plainly which part is
 * ending, states clearly which parts are not, and gives the two things the
 * owner can actually do about it.
 */
export function MediaReleaseWarning(props: MediaReleaseWarningProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>
        Enclosures released {daysLabel(props.daysUntilRelease)}
      </p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 8px', lineHeight: 1.5 }}>
        The photographs, recordings and files enclosed with{' '}
        {props.capsuleTitle ? `"${props.capsuleTitle}"` : 'one of your capsules'} reach the end of the storage
        period it was sealed with.
      </p>
      <p style={{ margin: '0 0 24px' }}>
        <EmailReading>{formatAbsoluteDate(props.releaseAtIso)}</EmailReading>
      </p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 8px', lineHeight: 1.5 }}>
        The letter itself is kept. So are the dates, the record of who it went to, and any replies written
        back — permanently. Only the enclosed files are removed.
      </p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
        You can download a copy of everything from Settings before then, or extend the storage on this
        capsule.
      </p>
      <EmailButton href={props.capsuleUrl}>View capsule</EmailButton>
    </EmailLayout>
  );
}
