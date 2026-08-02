import { EmailButton, EmailLayout, emailColors } from './Layout.js';

export interface PasswordResetProps {
  resetUrl: string;
}

export function PasswordReset({ resetUrl }: PasswordResetProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Reset your password</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
        Someone requested a password reset for this account. This link expires in 60 minutes.
      </p>
      <EmailButton href={resetUrl}>Reset password</EmailButton>
      <p style={{ fontSize: 13, color: emailColors.muted, margin: '24px 0 0' }}>
        Didn&apos;t request this? You can safely ignore this email — your password won&apos;t change.
      </p>
    </EmailLayout>
  );
}
