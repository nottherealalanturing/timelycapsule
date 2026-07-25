import { EmailLayout, emailColors } from './Layout.js';

export interface NewDeviceAlertProps {
  ip: string | null;
  when: string;
}

export function NewDeviceAlert({ ip, when }: NewDeviceAlertProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>New login to your account</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 8px', lineHeight: 1.5 }}>
        We noticed a sign-in from a device we haven&apos;t seen before.
      </p>
      <p style={{ fontSize: 13, color: emailColors.ink, margin: '0 0 24px' }}>
        {when}
        {ip ? ` · IP ${ip}` : ''}
      </p>
      <p style={{ fontSize: 13, color: emailColors.mist, margin: 0 }}>
        If this was you, no action is needed. If it wasn&apos;t, reset your password immediately and review your
        active sessions in Settings.
      </p>
    </EmailLayout>
  );
}
