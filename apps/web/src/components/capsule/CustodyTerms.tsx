'use client';

import type { Capsule } from '@tc/contracts';

/**
 * The terms this capsule is held under, in the words they were set in.
 *
 * The Overview panel this replaces read `Type: self`, `Size: 0.0 KB`,
 * `Allow download: Yes`, `Announce on seal: Yes` — four raw column names and
 * a storage figure. The composer had already found the language for every one
 * of those settings ("They can keep a copy", "Tell Amara now that something is
 * waiting"), so the product described the same facts twice, in two
 * vocabularies, and only one of them sounded like the product.
 *
 * Three rules:
 *
 *   - **Only what is true is stated.** A `dl` of Yes/No pairs makes a reader
 *     parse eight values to learn three things. Terms that are not in force
 *     are simply absent, which is how `SealMovement` states conditions too.
 *   - **Past tense** (`09 §XVI`). These were decided at sealing; the capsule
 *     is being looked after now, not configured.
 *   - **`sizeBytes` is gone.** A byte count on the artifact is a storage
 *     figure on a letter, and Settings → Storage is where a quota belongs.
 */
export function CustodyTerms({ capsule, addressee }: { capsule: Capsule; addressee: string | null }) {
  const who = addressee ?? 'They';
  const isSelf = capsule.type === 'self';
  const sealed = capsule.state !== 'draft';

  const terms: string[] = [];

  if (!isSelf && sealed) {
    terms.push(
      capsule.announceOnSeal
        ? `${who} ${addressee ? 'was' : 'were'} told something is waiting.`
        : `${who} ${addressee ? 'hears' : 'hear'} nothing until it opens.`,
    );
  }

  if (!isSelf) {
    terms.push(
      capsule.allowDownload ? 'They can keep a copy once it opens.' : 'They cannot download what is inside.',
    );
    if (capsule.recipientsVisible) terms.push('They can see who else is receiving this.');
  }

  for (const seal of capsule.seals) {
    if (seal.type === 'place') terms.push('It opens only at a place.');
    if (seal.type === 'passphrase') terms.push('It needs a passphrase.');
    if (seal.type === 'identity') terms.push(`${who} must prove who they are.`);
  }
  if (capsule.requireRecipientVerification && !capsule.seals.some((s) => s.type === 'identity')) {
    terms.push(`${who} must prove who they are.`);
  }

  if (capsule.expiryStrict) {
    terms.push('One reading only — the record is destroyed once it has been read.');
  } else if (capsule.expiresAfter) {
    terms.push('Kept for a while after opening, then gone.');
  }

  if (isSelf && capsule.breakGlass === 'allowed') {
    terms.push('You can open it early, after forty-eight hours.');
  }

  /**
   * M4 — how long the enclosures are kept is a term this capsule is held
   * under, so it belongs here with the others rather than only in Settings.
   * Without it the owner could be offered an irreversible "Release
   * enclosures" button, and warned by email a month ahead, while the
   * capsule's own page said nothing about when it would happen anyway.
   *
   * Gated on the capsule still *holding* bytes rather than on the date
   * being in the future, for two reasons. An owner who releases early
   * leaves a retention date still years away against a capsule with
   * nothing left in storage, and this line would then promise enclosures
   * were kept until 2027 when they had already gone. And reading the clock
   * during render is impure (`react-hooks/purity`) and can disagree
   * between server and client — where `sizeBytes` is a fact the row
   * already carries. It is also the same condition the Release control
   * uses, so the statement and the control cannot contradict each other.
   *
   * Once released, the enclosures each say "Released from storage on …"
   * inside the record, which is more precise and per-item anyway.
   */
  if (capsule.sizeBytes > 0 && capsule.mediaRetentionUntil) {
    terms.push(
      `The enclosures are kept until ${new Date(capsule.mediaRetentionUntil).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}. The letter is kept for good.`,
    );
  }

  if (terms.length === 0) {
    terms.push('Nothing beyond the date.');
  }

  return (
    <section className="flex flex-col gap-3">
      <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
        How it is kept
      </span>
      <ul className="flex flex-col gap-1.5">
        {terms.map((term) => (
          <li key={term} className="text-[length:var(--text-body-s)] text-foreground">
            {term}
          </li>
        ))}
      </ul>
    </section>
  );
}
