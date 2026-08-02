import { EmailLayout, EmailReading, emailColors } from './Layout.js';

export interface VerifyEmailProps {
  code: string;
}

export function VerifyEmail({ code }: VerifyEmailProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Confirm your email address</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
        Enter this code to finish setting up your account. It expires in 15 minutes.
      </p>
      <p
        style={{
          backgroundColor: emailColors.ground,
          borderRadius: 3,
          padding: '16px 24px',
          textAlign: 'center',
          margin: '0 0 24px',
        }}
      >
        <EmailReading large>{code}</EmailReading>
      </p>
      <p style={{ fontSize: 13, color: emailColors.muted, margin: 0 }}>
        Didn&apos;t request this? You can safely ignore this email.
      </p>
    </EmailLayout>
  );
}
