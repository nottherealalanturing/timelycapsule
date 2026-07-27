import { EmailLayout, emailColors } from './Layout.js';

export interface ReactionReceivedProps {
  recipientName: string;
  emoji: string;
  note: string | null;
  dashboardUrl: string;
}

export function ReactionReceived({ recipientName, emoji, note, dashboardUrl }: ReactionReceivedProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>
        {recipientName} reacted {emoji}
      </p>
      {note ? (
        <p style={{ fontSize: 14, color: emailColors.ink, margin: '0 0 24px', lineHeight: 1.5, fontStyle: 'italic' }}>&ldquo;{note}&rdquo;</p>
      ) : null}
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ borderRadius: 10, backgroundColor: emailColors.gold }}>
              <a
                href={dashboardUrl}
                style={{ display: 'inline-block', padding: '12px 24px', fontSize: 14, fontWeight: 600, color: emailColors.ink, textDecoration: 'none' }}
              >
                View reaction
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
