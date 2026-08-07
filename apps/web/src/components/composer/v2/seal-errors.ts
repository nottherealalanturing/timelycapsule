import { ApiClientError } from '../../../lib/api-client';

export interface SealProblem {
  /** What happened, and what it means — stated plainly. */
  message: string;
  /** Where the writer can actually go, when there is somewhere to go. */
  action?: { label: string; href: string };
  /**
   * True when trying the same thing again could plausibly work — a network
   * blip, a server fault. False for anything the writer must resolve first.
   * Telling someone to retry a limit they have reached is advice that can
   * never succeed.
   */
  retryable: boolean;
}

const GENERIC: SealProblem = {
  message: 'The capsule could not be sealed. Nothing has been changed, and your letter is safe.',
  retryable: true,
};

/**
 * Why a seal did not happen.
 *
 * Both composer entry points used to collapse every failure into one line —
 * "Something went wrong sealing your capsule. Try again." — which was wrong in
 * three different ways at once for the most common real case. A guest who has
 * already sealed a capsule gets a documented, deliberate 409
 * (`guest_capsule_limit`) carrying the sentence "One capsule per guest session
 * — sign up free for more". Nothing went wrong; a limit was reached. Retrying
 * can never succeed, so "Try again" is advice that wastes the reader's time.
 * And the one thing that *would* work — an account — was never mentioned,
 * leaving someone holding a finished letter with no way forward.
 *
 * `07 §V.10` asks errors to state what happened, what it means, and what
 * happens next. That needs the specific code, so this maps them rather than
 * surfacing `error.message` blindly: some API messages are written for people
 * ("Media is still uploading or processing") and some are written for logs
 * ("Plan limit reached: active_sealed_capsules:5").
 */
export function describeSealFailure(error: unknown): SealProblem {
  if (!(error instanceof ApiClientError)) return GENERIC;

  switch (error.code) {
    case 'guest_capsule_limit':
      return {
        message:
          'A guest can keep one capsule at a time, and this device already has one. Your letter stays here — a free account can seal it, and keeps the first one too.',
        action: { label: 'Create a free account', href: '/signup' },
        retryable: false,
      };

    case 'guest_session_invalid':
      return {
        message:
          'This guest session has ended, which happens once its capsule has been claimed by an account. Your letter stays on this device.',
        action: { label: 'Sign in', href: '/login' },
        retryable: false,
      };

    case 'upload_incomplete':
      return {
        message: 'Something enclosed has not finished arriving. Once it lands, this can be sealed.',
        retryable: true,
      };

    case 'quota_exceeded':
      return {
        message: 'You are holding as many sealed capsules as this plan keeps at once.',
        action: { label: 'See the plans', href: '/pricing' },
        retryable: false,
      };

    case 'plan_required':
      return {
        message: 'One of the conditions on this capsule needs a paid plan.',
        action: { label: 'See the plans', href: '/pricing' },
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
      };

    default:
      // A real fault — the message the API sent is the most accurate thing
      // available, and it is at least written as a sentence.
      return { message: error.message || GENERIC.message, retryable: true };
  }
}
