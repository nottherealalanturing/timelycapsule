import { EmailLayout, emailColors } from './Layout.js';

export interface PasswordResetProps {
  resetUrl: string;
}

export function PasswordReset({ resetUrl }: PasswordResetProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Reset your password</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 24px', lineHeight: 1.5 }}>
        Someone requested a password reset for this account. This link expires in 60 minutes.
      </p>
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ borderRadius: 10, backgroundColor: emailColors.gold }}>
              <a
                href={resetUrl}
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: emailColors.ink,
                  textDecoration: 'none',
                }}
              >
                Reset password
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: emailColors.mist, margin: '24px 0 0' }}>
        Didn&apos;t request this? You can safely ignore this email — your password won&apos;t change.
      </p>
    </EmailLayout>
  );
}
