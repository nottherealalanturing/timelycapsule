/**
 * Mirrors `apps/web/src/components/composer/v2/schedule-validity.ts` and,
 * through it, `assertUnlockAtWithinBounds` in the API's state machine
 * (`apps/api/src/modules/capsules/state-machine.ts`) — kept in step
 * deliberately: the client is not the authority here, but it should never
 * offer to send something the server is certain to refuse. Not ported into
 * `packages/core` alongside `horizons.ts`/`zoned-time.ts` because it
 * operates on this app's own capsule shape (`Capsule` from `@tc/contracts`),
 * not web's `CapsuleDraft` — a shared version would need more indirection
 * than the ~15 lines of logic it wraps are worth.
 *
 * `MAX_UNLOCK_HORIZON_MS` is fixed at the account ceiling (50 years) rather
 * than threaded through a `capabilities` object the way web's does — mobile
 * has no guest entry point (Decision 2, authenticated-first; guest
 * deferred), so there is only ever one horizon to enforce.
 */
export const MIN_UNLOCK_LEAD_MS = 5 * 60 * 1000;
export const MAX_UNLOCK_HORIZON_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;

export interface ScheduleProblem {
  /** What is wrong with the chosen moment, and what to do about it. */
  message: string;
  /** True once the moment has slipped into the past — the recoverable case. */
  passed: boolean;
}

/**
 * A live reading, not a latched error — recomputed from the current clock
 * and the current selection every render, exactly like web's own version.
 * Choosing a new moment makes a stale problem untrue on its own; there is
 * nothing to clear or expire.
 */
export function describeScheduleProblem(selected: Date | null, nowMs: number | null): ScheduleProblem | null {
  if (!selected || nowMs === null) return null;

  const lead = selected.getTime() - nowMs;

  if (lead < MIN_UNLOCK_LEAD_MS) {
    return {
      passed: true,
      message:
        lead <= 0
          ? 'The moment this was set to open has passed. Choose a new one, and this can be sealed.'
          : 'That moment is now less than five minutes away. Choose one a little further out.',
    };
  }

  if (lead > MAX_UNLOCK_HORIZON_MS) {
    return { passed: false, message: 'A capsule can travel up to fifty years.' };
  }

  return null;
}
