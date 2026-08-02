import { EmailButton, EmailLayout, emailColors } from './Layout.js';

export interface SomethingWaitingProps {
  senderName: string;
  teaser: string | null;
  /**
   * Full recipient reveal link (`/c/:token#k=...`), constructed and
   * relayed by the owner's browser — the server never holds the capsule
   * key that lives in this URL's fragment (T-14 decisions log).
   */
  link: string;
}

export function SomethingWaiting({ senderName, teaser, link }: SomethingWaitingProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Something is waiting for you</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        {senderName} has sealed a time capsule for you. It&apos;ll open on its own — no need to do anything until then.
      </p>
      {teaser ? (
        <p style={{ fontSize: 14, color: emailColors.ink, margin: '0 0 24px', lineHeight: 1.5, fontStyle: 'italic' }}>
          &ldquo;{teaser}&rdquo;
        </p>
      ) : null}
      <EmailButton href={link}>View the countdown</EmailButton>
      <p style={{ fontSize: 13, color: emailColors.muted, margin: '24px 0 0' }}>
        Save this email — this link is how you&apos;ll open it later.
      </p>
    </EmailLayout>
  );
}
