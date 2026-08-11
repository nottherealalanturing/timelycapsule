import { EmailButton, EmailLayout, emailColors } from './Layout.js';

/**
 * "Someone replied." And that is the whole of it.
 *
 * There is no `note` prop here and there must never be one. The template this
 * replaces (`ReactionReceived`) rendered the reply's text into the body, and
 * because every send also persists its props as the outbound message payload,
 * the same text was written to our database in the clear a second time. A
 * reply is capsule content; email is not a place capsule content goes.
 *
 * So the email carries exactly one fact — that there is something to read —
 * and a door back to the place where it can be read, which is the only place
 * the key exists.
 */
export interface ReplyReceivedProps {
  recipientName: string;
  capsuleUrl: string;
}

export function ReplyReceived({ recipientName, capsuleUrl }: ReplyReceivedProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>{recipientName} replied to your capsule.</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
        What they wrote is sealed to you, so it is not in this email and it is not readable by us. Open the capsule to
        read it.
      </p>
      <EmailButton href={capsuleUrl}>Read the reply</EmailButton>
    </EmailLayout>
  );
}
