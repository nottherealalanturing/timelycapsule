/**
 * One lifecycle, every kind of enclosure.
 *
 * A photograph, a video, a document and a voice recording all travel the same
 * road: they are encrypted on this device, sent, finished, and then they are
 * part of the letter. Before this, each of those steps was invisible — a row
 * appeared reading `0 of 1`, sat there through the slowest part of the work
 * (encryption, which reports nothing), and then vanished and reappeared in a
 * different list. Whether anything was happening at all was a matter of faith.
 *
 * These are **readings, not loading**. `07 §XVI` bans progress bars, spinners
 * and shimmer outright, and that ban is not a style preference: a bar implies
 * a job half-done, and `03 §V.2` reserves that grammar for nothing at all in
 * this product. What replaces it is the same thing the Dual Clock does — say
 * precisely where the work is, in words and counted parts, and stop.
 */
export type EnclosureStage =
  | 'encrypting'
  | 'sending'
  | 'finishing'
  | 'enclosed'
  | 'failed';

/**
 * What each stage is called, in the product's own vocabulary.
 *
 * "Upload" appears nowhere a writer can read it. The product encloses things;
 * `sending` is the transfer and `enclosed` is the outcome, which makes the
 * pair read as one act rather than as a file operation.
 *
 * `encrypting` is stated rather than hidden on purpose. It is the one moment
 * where the product's central promise — *this is encrypted before it leaves
 * your device* — is literally happening, and the landing page has already
 * made that claim to the same person. Naming it here is the claim being kept
 * in front of them.
 */
export const STAGE_LABEL: Record<EnclosureStage, string> = {
  encrypting: 'Encrypting',
  sending: 'Enclosing',
  finishing: 'Finishing',
  enclosed: 'Enclosed',
  failed: 'Not enclosed',
};

export interface PendingEnclosure {
  /** Client-side identity — survives the whole lifecycle, unlike the server's id. */
  id: string;
  name: string;
  stage: EnclosureStage;
  /** Parts actually landed, and how many there are. A count, never a bar. */
  partsDone: number;
  partsTotal: number;
  /** Why it stopped, when it stopped. */
  error?: string;
  /** Present once the server has a row for this — needed to clean up a failure. */
  mediaId?: string;
  /**
   * Kept so a failure can be retried without asking the writer to find the
   * file again. A failed enclosure that can only be removed makes the writer
   * pay for a network blip.
   */
  file?: File;
}

/**
 * The reading for a pending enclosure, in one line.
 *
 * During transfer the parts count is the honest measure and the only one —
 * it says what has actually landed rather than predicting when it will.
 */
export function stageReading(item: PendingEnclosure): string {
  if (item.stage === 'failed') return item.error ?? STAGE_LABEL.failed;
  if (item.stage === 'sending' && item.partsTotal > 1) {
    return `${STAGE_LABEL.sending} · ${item.partsDone} of ${item.partsTotal}`;
  }
  return STAGE_LABEL[item.stage];
}
