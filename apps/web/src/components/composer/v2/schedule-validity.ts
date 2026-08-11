import { instantFrom } from '../../../lib/zoned-time';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';

/**
 * Mirrors `assertUnlockAtWithinBounds` in the API's state machine. Kept in
 * step deliberately: the client is not the authority here, but it should never
 * offer to send something the server is certain to refuse.
 */
export const MIN_UNLOCK_LEAD_MS = 5 * 60 * 1000;

export interface ScheduleProblem {
  /** What is wrong with the chosen moment, and what to do about it. */
  message: string;
  /** True once the moment has slipped into the past — the recoverable case. */
  passed: boolean;
}

/**
 * The chosen instant, however it was chosen.
 *
 * `unlockLocal` capsules have no single instant until a recipient's zone is
 * known; interpreting it in the stated zone is the same best-effort the rest
 * of the composer makes, and it is the value the writer is actually looking at.
 */
export function selectedInstant(capsule: NonNullable<CapsuleDraft['capsule']>): Date | null {
  if (capsule.unlockAt) return new Date(capsule.unlockAt);
  if (capsule.unlockLocal) {
    const [y, m, d] = capsule.unlockLocal.date.split('-').map(Number);
    const [hh, mm] = capsule.unlockLocal.time.split(':').map(Number);
    if (y && m && d) {
      return instantFrom({ year: y, month: m, day: d, hour: hh ?? 9, minute: mm ?? 0 }, capsule.unlockLocal.tz);
    }
  }
  return null;
}

/**
 * Whether the chosen moment is still a moment you could seal towards.
 *
 * **This is a live reading, not a latched error**, and that distinction is the
 * whole of the bug it was written for. Address used to compute the same check
 * against a `now` captured once at mount — reasonable for a horizon measured
 * in years, and wrong at the near end of the scale: choose five minutes out,
 * write for six, and the frozen clock still reports five minutes remaining
 * while the server has already begun refusing the capsule. The writer's first
 * news of it was Seal failing.
 *
 * Because it is derived from the current time and the current schedule rather
 * than remembered from a failed request, it also resolves itself: choosing a
 * new moment makes the problem untrue, so nothing has to be cleared, reset, or
 * expired. That is why there is no effect here and no state to invalidate.
 */
export function describeScheduleProblem(
  selected: Date | null,
  nowMs: number | null,
  maxHorizonMs: number,
): ScheduleProblem | null {
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

  if (lead > maxHorizonMs) {
    return {
      passed: false,
      message:
        maxHorizonMs < 2 * 365 * 24 * 3600_000
          ? 'Guests can travel up to a year. An account goes to fifty.'
          : 'A capsule can travel up to fifty years.',
    };
  }

  return null;
}
