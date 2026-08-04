import type { Capsule } from '@tc/contracts';

/**
 * The footer hint — names the single first thing standing between this draft
 * and a seal.
 *
 * No longer asks for a title. In V2 a title is optional and lives on the review
 * screen, where it is what the *sender* files the capsule under rather than
 * anything the recipient sees; requiring one made naming a letter the first
 * obstacle to writing it, which is the hardest possible opening move.
 *
 * What it does require is a letter and a moment, in that order, because those
 * are the two things a capsule cannot be without. Sealing an empty letter
 * addressed to nobody is permanent in exactly the same way as sealing a real
 * one.
 */
export function firstCompletenessBlocker(capsule: Capsule, hasWords: boolean): string | null {
  if (!hasWords) {
    return 'Write something to seal';
  }
  if (!capsule.unlockAt && !capsule.unlockLocal) {
    return 'Choose when it opens';
  }
  return null;
}
