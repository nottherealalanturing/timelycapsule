import { EmailButton, EmailLayout, emailColors } from './Layout.js';

export interface BounceAlertProps {
  recipientEmail: string;
  capsuleTitle: string | null;
  daysUntilUnlock: number | null;
  manageUrl: string;
}

export function BounceAlert({ recipientEmail, capsuleTitle, daysUntilUnlock, manageUrl }: BounceAlertProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>A recipient couldn&apos;t be reached</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        Emails to <strong>{recipientEmail}</strong> for {capsuleTitle ? `"${capsuleTitle}"` : 'your capsule'} keep bouncing.
        {daysUntilUnlock !== null ? ` It unlocks in ${daysUntilUnlock} day${daysUntilUnlock === 1 ? '' : 's'} — ` : ' '}
        Please double-check the address before then.
      </p>
      <EmailButton href={manageUrl}>Fix recipient</EmailButton>
    </EmailLayout>
  );
}
