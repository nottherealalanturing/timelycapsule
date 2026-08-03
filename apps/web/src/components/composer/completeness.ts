import type { Capsule } from '@tc/contracts';

/** Footer completeness hint — names the single first blocker, per 02-UX-DESIGN.md §5.5. */
export function firstCompletenessBlocker(capsule: Capsule): string | null {
  if (!capsule.title || capsule.title.trim().length === 0) {
    return 'Give your capsule a title';
  }
  if (!capsule.unlockAt && !capsule.unlockLocal) {
    return 'Add an unlock date to seal';
  }
  return null;
}
