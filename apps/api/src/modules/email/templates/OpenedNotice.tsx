import { EmailLayout, emailColors } from './Layout.js';

export interface OpenedNoticeProps {
  recipientName: string;
  capsuleTitle: string | null;
  dashboardUrl: string;
}

export function OpenedNotice({ recipientName, capsuleTitle, dashboardUrl }: OpenedNoticeProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>
        {recipientName} opened your capsule
      </p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 24px', lineHeight: 1.5 }}>
        {capsuleTitle ? `"${capsuleTitle}"` : 'Your capsule'} has been opened by {recipientName}.
      </p>
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ borderRadius: 10, backgroundColor: emailColors.gold }}>
              <a
                href={dashboardUrl}
                style={{ display: 'inline-block', padding: '12px 24px', fontSize: 14, fontWeight: 600, color: emailColors.ink, textDecoration: 'none' }}
              >
                View activity
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
