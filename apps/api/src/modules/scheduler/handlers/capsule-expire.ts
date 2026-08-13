import { expireCapsule } from '../../capsules/index.js';
import type { ActionHandler } from './dispatch.js';

/**
 * "One reading only" — the destructive fulfilment of `expiry_strict`,
 * scheduled by `scheduleCapsuleExpiry` the moment a recipient confirms they
 * actually decrypted the content (`reveal/service.ts`'s confirm-read path),
 * not merely that the reveal URL was opened. All the actual work — R2-first
 * deletion, then the DB transaction, then cancelling anything stray — lives
 * in `expireCapsule`, which re-derives its own authority from the capsule
 * row exactly like `mediaReleaseHandler`/`capsuleUnlockHandler` do, rather
 * than trusting that this row exists for a still-valid reason.
 */
export const capsuleExpireHandler: ActionHandler = async ({ db, subjectId: capsuleId }) => {
  await expireCapsule(db, capsuleId);
};
