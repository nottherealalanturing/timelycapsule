import { EmailLayout, emailColors } from './Layout.js';

export interface VerifyEmailProps {
  code: string;
}

export function VerifyEmail({ code }: VerifyEmailProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Confirm your email address</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 24px', lineHeight: 1.5 }}>
        Enter this code to finish setting up your account. It expires in 15 minutes.
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: 8,
          color: emailColors.ink,
          backgroundColor: emailColors.bg,
          borderRadius: 10,
          padding: '16px 24px',
          textAlign: 'center',
          margin: '0 0 24px',
        }}
      >
        {code}
      </p>
      <p style={{ fontSize: 13, color: emailColors.mist, margin: 0 }}>
        Didn&apos;t request this? You can safely ignore this email.
      </p>
    </EmailLayout>
  );
}
