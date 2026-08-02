/**
 * The ten help articles (T-21). Product documentation, not marketing: every
 * claim below describes the system as built — sealing immutability (T-08),
 * the recipient path (T-15), guest mode (T-15b), recovery codes (T-07b/T-11),
 * account deletion (T-18), export (T-18). Voice per `07 §VIII`: plain, exact,
 * unhurried; no exclamation marks; past-tense delivery language (`09 §XVI`).
 *
 * Plain structured content rather than markdown files — no markdown parser in
 * the bundle (T-20's Worker budget), and these render as server components.
 */
export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  body: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'what-is-sealing',
    title: 'What sealing means',
    summary: 'Sealing makes a capsule immutable until its date. What that locks, and what stays changeable.',
    body: [
      'Sealing is the moment a capsule stops being a draft. You choose the date, confirm, and from then on the contents — the letter and any files — cannot be read, edited, or replaced. Not by you, and not by us. The encryption key that could open them is not something our servers hold.',
      'Some things remain changeable after sealing, because they are about delivery rather than contents. You can add or remove recipients until the capsule opens. You can extend the opening date once, by up to thirty days. You can withdraw the capsule entirely, which cancels delivery for good.',
      'What you cannot do is peek. A sealed capsule shows its envelope — title, cover, dates, recipients — and nothing else. The wait is the point.',
    ],
  },
  {
    slug: 'can-i-open-early',
    title: 'Can I open a capsule early?',
    summary: 'Not by default. Sealed means sealed. The one exception you can grant yourself.',
    body: [
      'No. When you seal a capsule you are making a deliberate promise to the date, and the system holds you to it. There is no support channel that opens capsules early, because there is no mechanism for anyone — including us — to decrypt one before its time.',
      'The one exception is a capsule addressed to yourself: at sealing time you may permit break-glass, which keeps an emergency path open for you alone. If you did not permit it when you sealed, it does not exist.',
      'If the date itself was a mistake, you have two tools: extend it once (up to thirty days later), or withdraw the capsule — which cancels it permanently rather than opening it.',
    ],
  },
  {
    slug: 'recipient-guide',
    title: 'Receiving a capsule',
    summary: 'What the link is, what you need, and what happens on the day it opens.',
    body: [
      'Someone sealed a capsule for you. What you received is a link — usually by email — and the link is everything you need. No account, no app, no download. It works in an ordinary browser, including on old phones.',
      'Before the date, the link shows the wait: who sealed it, when it opens, and how far away that is. You can ask to be told when it opens, or add the date to your calendar.',
      'On the date, the same link opens the capsule. You read the letter in your browser; photographs and recordings open alongside it. You can download a copy of everything — it is yours to keep, independent of us.',
      'Some capsules carry conditions: a place to be, a passphrase the sender shared with you, or a confirmation that you are you (a code sent to your email). The page walks you through whichever applies.',
      'Keep the link. It is the key, in a literal sense — part of the decryption key travels inside it and never touches our servers. If you lose it, ask the sender to resend it.',
    ],
  },
  {
    slug: 'recovery-code',
    title: 'Your recovery code',
    summary: 'Why it exists, why it is shown once, and what is lost without it.',
    body: [
      'When you created your account you were shown a recovery code, once, and asked to keep it somewhere safe. That code is the second of exactly two ways to unlock your encrypted capsules — the first is your password.',
      'This is a consequence of zero-access encryption. Your capsules are encrypted with a key that only your password or your recovery code can unwrap. We never hold the key, which is why we cannot read your capsules — and also why we cannot recover them for you.',
      'If you forget your password, the recovery code restores access. If you lose both, your account can be reset but the contents of your capsules cannot be recovered, by anyone. That is not a policy; it is arithmetic.',
      'You can change your password any time in Settings with the old one in hand — the encryption re-wraps automatically.',
    ],
  },
  {
    slug: 'how-encryption-works',
    title: 'How the encryption works',
    summary: 'Encrypted on your device, ciphertext on our servers, the key in your hands.',
    body: [
      'Everything you put in a capsule is encrypted on your device — in your browser — before any of it is uploaded. What our servers store is ciphertext: bytes that cannot be read without a key we do not have.',
      'Each capsule has its own key. For you, that key is wrapped under your master key, which is itself wrapped under your password and your recovery code. For a recipient, the capsule key travels inside their link — in a part of the address that browsers never send to servers. Their link is their key.',
      'This is why there is no preview, no server-side search of your letters, and no way for support to see what you wrote. The plaintext exists in exactly two places: the device that wrote it, and the device that opens it.',
    ],
  },
  {
    slug: 'withdrawing-a-capsule',
    title: 'Withdrawing a capsule',
    summary: 'Cancelling delivery for good — what recipients are told, and what happens to the contents.',
    body: [
      'Withdrawing a sealed capsule cancels its delivery permanently. It is available up to the moment the capsule opens; once any recipient has opened it, it cannot be withdrawn.',
      'Recipients who knew the capsule existed are told it was withdrawn. They are not shown the contents, and never will be.',
      'A withdrawn capsule is kept for thirty days, then permanently deleted, files included. Withdrawal cannot be undone.',
    ],
  },
  {
    slug: 'extending-the-date',
    title: 'Extending the opening date',
    summary: 'Once, by up to thirty days. Why the limit is strict.',
    body: [
      'A sealed capsule’s date can be moved later — once, and by no more than thirty days. Recipients see the updated date.',
      'The limit is deliberate. A capsule that can be postponed indefinitely is not sealed; it is a draft with ceremony. One bounded extension covers the honest cases — a birthday that moved, a delivery that should land on a weekend — without dissolving the promise.',
      'The date cannot be moved earlier. If the capsule should open sooner than you sealed it for, the tool for that is withdrawal and a new capsule.',
    ],
  },
  {
    slug: 'guest-capsules',
    title: 'Capsules without an account',
    summary: 'Write and seal one capsule before signing up. What guest mode can and cannot do.',
    body: [
      'You can write and seal one capsule without creating an account. It is a real capsule — encrypted, sealed, delivered on the date — with real limits: text only, up to a year ahead, delivered by a link you keep yourself.',
      'The link is shown once, when you seal. It is the only copy, and it contains the key. Lose the link, lose the capsule — there is no account to recover it from.',
      'If you sign up afterwards from the same device, the capsule is claimed into your account and appears alongside everything else you seal.',
    ],
  },
  {
    slug: 'deleting-your-account',
    title: 'Deleting your account',
    summary: 'The thirty-day window, and what happens to capsules other people are waiting for.',
    body: [
      'Account deletion is a thirty-day process, and it starts with the one question that matters: what should happen to sealed capsules other people are waiting for?',
      'For each undelivered capsule with recipients, you choose — deliver it as scheduled, or withdraw it. Delivered capsules arrive with your name removed from the account system but the letter intact; a promise made to a recipient survives the account that made it, if you want it to.',
      'For thirty days, nothing is final. Logging back in cancels the deletion entirely. After thirty days, the account and everything that was not marked for delivery is permanently removed.',
    ],
  },
  {
    slug: 'your-export',
    title: 'Exporting everything',
    summary: 'A zip of everything you own, on demand, from Settings.',
    body: [
      'From Settings, you can request an export of everything you own: your letters and files exactly as stored, and a plain-text index of your capsules, recipients, tags and collections.',
      'The archive is built in the background and a download link is sent to your email. The link works for seven days.',
      'Letters and files arrive encrypted, exactly as our servers hold them — the export is proof of what we store, which is ciphertext. Your own capsules remain readable through the app, where your keys live.',
      'The export is on every plan, including Free. It is how "your capsules outlive our roadmap" stays a fact rather than a slogan.',
    ],
  },
  {
    slug: 'delivery-and-payment',
    title: 'Delivery is never gated by payment',
    summary: 'What happens to sealed capsules if you downgrade, lapse, or leave.',
    body: [
      'Once a capsule is sealed, its delivery does not depend on your payment state. Lapse, downgrade, cancel — the capsule still opens on its date, and the recipient still receives it.',
      'This is a structural rule of the system, listed alongside the encryption guarantees, not a term in a pricing table. Plans change what you can create, never what has already been promised.',
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
