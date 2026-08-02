import { EmailButton, EmailLayout, emailColors } from './Layout.js';

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
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
        {capsuleTitle ? `"${capsuleTitle}"` : 'Your capsule'} has been opened by {recipientName}.
      </p>
      <EmailButton href={dashboardUrl}>View activity</EmailButton>
    </EmailLayout>
  );
}
