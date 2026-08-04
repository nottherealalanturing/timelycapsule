/**
 * What a capsule's encrypted blob actually contains.
 *
 * `contentDocEnc` used to hold a bare TipTap document. Capsule Creation V2 adds
 * place-as-memory — *where this was written* — and that is *content*: it is
 * shown to the recipient as part of the record, and the hard rule in
 * `plan/00-INDEX.md` is that capsule contents never reach servers in plaintext.
 * Storing it as an ordinary column would hand the server the writer's location,
 * so it travels inside the same encrypted envelope as the letter.
 *
 * Older capsules hold a bare document where the envelope now sits, so every
 * reader goes through `readEnvelope`, which accepts both shapes. There is no
 * migration to run — the server cannot read these blobs, so nothing but the
 * clients ever needs to understand them.
 */

export interface PlaceMemory {
  /** What the writer called it — "Lagos Island Maternity Hospital". */
  name: string;
  lat: number;
  lng: number;
}

export interface LetterEnvelope {
  /** TipTap document JSON. */
  doc: unknown;
  /** Where the letter was written, if the writer chose to enclose it. */
  writtenAt: PlaceMemory | null;
}

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export function emptyEnvelope(): LetterEnvelope {
  return { doc: EMPTY_DOC, writtenAt: null };
}

function isTipTapDoc(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'doc';
}

/** Accepts either an envelope or a legacy bare document. Never throws. */
export function readEnvelope(value: unknown): LetterEnvelope {
  if (isTipTapDoc(value)) return { doc: value, writtenAt: null };
  if (typeof value === 'object' && value !== null && 'doc' in value) {
    const env = value as Partial<LetterEnvelope>;
    return { doc: isTipTapDoc(env.doc) ? env.doc : EMPTY_DOC, writtenAt: env.writtenAt ?? null };
  }
  return emptyEnvelope();
}

/**
 * Plain text of a letter, for surfaces that render a reading rather than an
 * editor — the reveal, the owner's own view of what they sealed.
 *
 * Deliberately tolerant: an unrecognised block contributes nothing rather than
 * breaking the render. A recipient must never meet a blank screen because a
 * node type they have no way to care about failed to parse.
 */
export function envelopeText(value: unknown): string {
  const { doc } = readEnvelope(value);
  const node = doc as { content?: { content?: { text?: string }[] }[] } | null;
  if (!node?.content) return '';
  return node.content
    .map((block) => (block.content ?? []).map((leaf) => leaf.text ?? '').join(''))
    .filter((line) => line.length > 0)
    .join('\n\n');
}
