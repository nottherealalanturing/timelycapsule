import { EmailLayout, emailColors } from './Layout.js';

export type PreUnlockReminderProps =
  | { audience: 'owner'; capsuleTitle: string | null; daysUntilUnlock: number; dashboardUrl: string }
  | { audience: 'recipient'; senderName: string; daysUntilUnlock: number };

function daysLabel(days: number): string {
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

export function PreUnlockReminder(props: PreUnlockReminderProps) {
  if (props.audience === 'owner') {
    return (
      <EmailLayout>
        <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Your words arrive {daysLabel(props.daysUntilUnlock)}</p>
        <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 24px', lineHeight: 1.5 }}>
          {props.capsuleTitle ? `"${props.capsuleTitle}"` : 'Your sealed capsule'} is about to unlock {daysLabel(props.daysUntilUnlock)}.
        </p>
        <table cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              <td style={{ borderRadius: 10, backgroundColor: emailColors.gold }}>
                <a
                  href={props.dashboardUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', fontSize: 14, fontWeight: 600, color: emailColors.ink, textDecoration: 'none' }}
                >
                  View capsule
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </EmailLayout>
    );
  }

  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Almost time</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 16px', lineHeight: 1.5 }}>
        The capsule {props.senderName} sealed for you unlocks {daysLabel(props.daysUntilUnlock)}. Keep the link from their
        earlier email handy — that&apos;s how you&apos;ll open it.
      </p>
    </EmailLayout>
  );
}
