import { EmailLayout, emailColors } from './Layout.js';

export interface BounceAlertProps {
  recipientEmail: string;
  capsuleTitle: string | null;
  daysUntilUnlock: number | null;
  manageUrl: string;
}

export function BounceAlert({ recipientEmail, capsuleTitle, daysUntilUnlock, manageUrl }: BounceAlertProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>We couldn&apos;t reach a recipient</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 16px', lineHeight: 1.5 }}>
        Emails to <strong>{recipientEmail}</strong> for {capsuleTitle ? `"${capsuleTitle}"` : 'your capsule'} keep bouncing.
        {daysUntilUnlock !== null ? ` It unlocks in ${daysUntilUnlock} day${daysUntilUnlock === 1 ? '' : 's'} — ` : ' '}
        Please double-check the address before then.
      </p>
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ borderRadius: 10, backgroundColor: emailColors.gold }}>
              <a
                href={manageUrl}
                style={{ display: 'inline-block', padding: '12px 24px', fontSize: 14, fontWeight: 600, color: emailColors.ink, textDecoration: 'none' }}
              >
                Fix recipient
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
