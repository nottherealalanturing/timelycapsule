import { ApiClientError } from './api-client';

export interface SealProblem {
  /** What happened, and what it means — stated plainly. */
  message: string;
  /**
   * True when trying the same thing again could plausibly work — a network
   * blip, a server fault. False for anything the writer must resolve first.
   * Mirrors `apps/web/src/components/composer/v2/seal-errors.ts`'s own
   * `retryable` exactly, for the same reason: telling someone to retry a
   * limit they have reached is advice that can never succeed.
   */
  retryable: boolean;
  /** Only ever set for the one case mobile has a real screen to send someone to. */
  goToAddress?: boolean;
}

const GENERIC: SealProblem = {
  message: 'The capsule could not be sealed. Nothing has been changed, and your letter is safe.',
  retryable: true,
};

/**
 * Why a seal did not happen — the mobile-reachable subset of web's own
 * `describeSealFailure`. Web's `guest_capsule_limit`/`guest_session_invalid`
 * (guest-only) and `plan_required` (Conditions/paid-seal-only) are omitted
 * deliberately: mobile has no guest entry point (Decision 2) and no
 * Conditions UI yet (E1.4.8 defers it, matching the readiness audit's own
 * §4.5 recommendation), so a mobile request can structurally never produce
 * either code. If the backend ever returns one anyway, it falls through to
 * the generic case below rather than being silently mismapped.
 */
export function describeSealFailure(error: unknown): SealProblem {
  if (!(error instanceof ApiClientError)) return GENERIC;

  switch (error.code) {
    case 'upload_incomplete':
      return {
        message: 'Something enclosed has not finished arriving. Once it lands, this can be sealed.',
        retryable: true,
      };

    case 'quota_exceeded':
      return {
        message: 'You are holding as many sealed capsules as this plan keeps at once.',
        retryable: false,
      };

    case 'capsule_sealed':
      return {
        message: 'This capsule is already sealed. Nothing further is needed.',
        retryable: false,
      };

    case 'capsule_withdrawn':
      return {
        message: 'This capsule was withdrawn and cannot be sealed again.',
        retryable: false,
      };

    case 'unlock_in_past':
    case 'validation_failed':
      return {
        message: 'The moment this opens has passed. Choose a new one in Address, then seal.',
        retryable: false,
        goToAddress: true,
      };

    default:
      // A real fault — the message the API sent is the most accurate thing
      // available, and it is at least written as a sentence.
      return { message: error.message || GENERIC.message, retryable: true };
  }
}
