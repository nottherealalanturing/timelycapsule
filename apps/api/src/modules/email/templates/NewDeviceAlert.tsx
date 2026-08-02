import { EmailLayout, EmailReading, emailColors } from './Layout.js';

export interface NewDeviceAlertProps {
  ip: string | null;
  when: string;
}

export function NewDeviceAlert({ ip, when }: NewDeviceAlertProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>New login to your account</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 8px', lineHeight: 1.5 }}>
        A sign-in from a device not seen before.
      </p>
      <p style={{ margin: '0 0 24px' }}>
        <EmailReading>
          {when}
          {ip ? ` · IP ${ip}` : ''}
        </EmailReading>
      </p>
      <p style={{ fontSize: 13, color: emailColors.muted, margin: 0 }}>
        If this was you, no action is needed. If it wasn&apos;t, reset your password immediately and review your
        active sessions in Settings.
      </p>
    </EmailLayout>
  );
}
