import { EmailLayout, emailColors } from './Layout.js';

export interface CapsuleUnlockedProps {
  senderName: string;
}

/**
 * No clickable link here by design — the recipient's link contains the
 * capsule decryption key in its URL fragment, which the server never
 * holds (T-14 decisions log), so this email can only point back to
 * whichever earlier email actually carried it.
 */
export function CapsuleUnlocked({ senderName }: CapsuleUnlockedProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Your capsule is open</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 16px', lineHeight: 1.5 }}>
        The time capsule {senderName} sealed for you has unlocked. Open the link from their earlier &ldquo;something is
        waiting&rdquo; email to view it.
      </p>
      <p style={{ fontSize: 13, color: emailColors.mist, margin: '24px 0 0' }}>
        Can&apos;t find that email? Ask {senderName} to resend your link.
      </p>
    </EmailLayout>
  );
}
