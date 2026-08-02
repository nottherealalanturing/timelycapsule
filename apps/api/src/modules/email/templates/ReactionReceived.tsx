import { EmailButton, EmailLayout, emailColors } from './Layout.js';

export interface ReactionReceivedProps {
  recipientName: string;
  /**
   * Wire/DB field name is `emoji` (packages/contracts/src/reveal.ts,
   * `reactions.emoji`) but the value is a named phrase, not a glyph — the
   * reveal ceremony replaced raw emoji with short phrases like "Thank you" /
   * "I miss you" (07 §VIII.5 bans emoji outright, including in email). This
   * template used to render "{name} reacted {emoji}", which read as broken
   * English ("Jordan reacted Thank you") once the value stopped being a
   * glyph. Quoted as a reply instead, which reads correctly for a phrase.
   */
  emoji: string;
  note: string | null;
  dashboardUrl: string;
}

export function ReactionReceived({ recipientName, emoji, note, dashboardUrl }: ReactionReceivedProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>
        {recipientName} replied: &ldquo;{emoji}&rdquo;
      </p>
      {note ? (
        <p style={{ fontSize: 14, color: emailColors.ink, margin: '0 0 24px', lineHeight: 1.5, fontStyle: 'italic' }}>
          &ldquo;{note}&rdquo;
        </p>
      ) : null}
      <EmailButton href={dashboardUrl}>View reaction</EmailButton>
    </EmailLayout>
  );
}
