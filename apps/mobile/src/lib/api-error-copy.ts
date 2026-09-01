import { ApiClientError } from './api-client';

/**
 * E1.4.10 — cross-cutting error/validation copy for the creation flow
 * (Address, Compose, media enclosure). Traced directly against the real
 * backend (`apps/api/src/modules/{capsules,recipients,media}/*.ts`, not the
 * readiness audit's own aspirational §7.6 list — `unsupported_media_type`
 * and `file_too_large` really are thrown at `POST .../media/tickets`, for
 * example, confirmed by reading `entitlements.ts`/`mime.ts` directly) rather
 * than assumed from either document.
 *
 * **No existing web copy to match for any of these.** Web's own equivalent
 * call sites (`Composer.tsx`'s `addRecipient`, `use-enclosures.ts`'s catch
 * block) collapse every one of these same server codes into one generic
 * message too (`'That recipient could not be added.'` /
 * `'Stopped before it finished'`) — a real, pre-existing gap on web itself,
 * confirmed by reading its source, not fixed here (out of a mobile ticket's
 * scope). This ticket's own DoD ("no generic error message reachable
 * anywhere in the creation flow") is a higher bar than web currently meets,
 * so the copy below is newly written against the real error codes rather
 * than ported from a web string that doesn't exist.
 */

/** Address's `patch()` and Compose's content-autosave — both PATCH the same capsule and can hit the same codes. */
export function describeCapsulePatchFailure(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'capsule_sealed':
        // Exact existing string (`use-capsule-compose.ts`'s own, established
        // since E1.4.3) — kept identical here rather than paraphrased, so a
        // capsule sealed mid-edit reads the same whether the rejected PATCH
        // came from Address or from Compose's autosave.
        return 'This capsule has already been sealed and can no longer be edited.';
      case 'unlock_in_past':
        // One combined message covering both bounds
        // (`state-machine.ts`'s own `assertUnlockAtWithinBounds` throws this
        // same code whether the moment is too soon or too far out) — a
        // technical `error.message` naming "5 minutes"/"50 years" as two
        // separate raw assertion strings is not worth parsing to pick one.
        return "That moment doesn't work — it needs to be at least five minutes from now, and no more than fifty years out.";
      case 'validation_failed':
        return "That couldn't be saved — something about it wasn't valid. Try again.";
    }
  }
  return "That couldn't be saved. Check your connection and try again.";
}

/** Address's `addRecipient()`/`removeRecipient()`. */
export function describeRecipientFailure(error: unknown, action: 'add' | 'remove'): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'recipient_already_added':
        return 'That recipient is already added.';
      case 'quota_exceeded':
        // `entitlements.ts`'s `assertWithinRecipientLimit` — per-capsule cap
        // (Free: 3), not the velocity throttle below.
        return 'This capsule already has as many recipients as this plan allows.';
      case 'velocity_limit_exceeded':
        // The server's own default message (`ApiError.velocityLimitExceeded`)
        // is already plain, specific, and complete — reused verbatim rather
        // than duplicated, so the two copies can't drift.
        return error.message;
      case 'recipient_locked':
        return 'Recipients can only be changed before this capsule opens.';
      case 'not_found':
        return action === 'add' ? "This capsule couldn't be found." : 'That recipient is already gone.';
    }
  }
  return action === 'add' ? 'That recipient could not be added.' : 'That recipient could not be removed.';
}

/** `use-media-enclosures.ts`'s enclose/retry pipeline. `retryable: false` for anything retrying the exact same bytes cannot fix. */
export function describeEncloseFailure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'file_too_large':
        return { message: 'This file is larger than this plan allows.', retryable: false };
      case 'unsupported_media_type':
        return { message: "This kind of file isn't supported yet.", retryable: false };
      case 'quota_exceeded':
        // `entitlements.ts`'s `assertWithinStorageQuota` — storage, not the
        // per-capsule recipient cap `describeRecipientFailure` handles.
        return { message: "You're out of storage on this plan.", retryable: false };
      case 'capsule_sealed':
        return { message: 'This capsule has already been sealed and can no longer be edited.', retryable: false };
    }
  }
  // Exact existing string (`use-media-enclosures.ts`'s own, established
  // since E1.4.7) — network failures and any other unmapped code stay here,
  // retryable, matching web's own identical fallback exactly.
  return { message: 'Stopped before it finished', retryable: true };
}
