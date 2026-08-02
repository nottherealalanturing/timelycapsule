import { EmailButton, EmailLayout, EmailReading, emailColors } from './Layout.js';

export type PreUnlockReminderProps =
  | { audience: 'owner'; capsuleTitle: string | null; daysUntilUnlock: number; unlockAtIso: string; dashboardUrl: string }
  | { audience: 'recipient'; senderName: string; daysUntilUnlock: number; unlockAtIso: string };

function daysLabel(days: number): string {
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

/**
 * `design/07-EXPERIENCE-BIBLE.md` §VIII rule 4: "Dates are always literal and
 * absolute. Relative time may accompany a date; it may never replace one."
 * This template previously only ever said "in 3 days" — the literal date was
 * computed at the call site and simply never passed in. Kept alongside the
 * relative phrasing rather than replacing it, per the same rule.
 */
function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PreUnlockReminder(props: PreUnlockReminderProps) {
  if (props.audience === 'owner') {
    return (
      <EmailLayout>
        <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>
          Your words arrive {daysLabel(props.daysUntilUnlock)}
        </p>
        <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 8px', lineHeight: 1.5 }}>
          {props.capsuleTitle ? `"${props.capsuleTitle}"` : 'Your sealed capsule'} is about to unlock.
        </p>
        <p style={{ margin: '0 0 24px' }}>
          <EmailReading>{formatAbsoluteDate(props.unlockAtIso)}</EmailReading>
        </p>
        <EmailButton href={props.dashboardUrl}>View capsule</EmailButton>
      </EmailLayout>
    );
  }

  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Almost time</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 8px', lineHeight: 1.5 }}>
        The capsule {props.senderName} sealed for you unlocks {daysLabel(props.daysUntilUnlock)}.
      </p>
      <p style={{ margin: '0 0 16px' }}>
        <EmailReading>{formatAbsoluteDate(props.unlockAtIso)}</EmailReading>
      </p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: 0, lineHeight: 1.5 }}>
        Keep the link from their earlier email handy — that&apos;s how you&apos;ll open it.
      </p>
    </EmailLayout>
  );
}
