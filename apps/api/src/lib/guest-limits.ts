import { GUEST_STORAGE_ALLOWANCE_BYTES } from '@tc/contracts';

/**
 * **What a Guest gets.**
 *
 * Deliberately not part of `PLAN_LIMITS` (`modules/capsules/entitlements.ts`).
 * A guest has no `entitlements` row — no user id to key one on — and is not
 * a billing plan at all: *"Guest should NOT become a miniature Free
 * account"* was the explicit founder instruction M5 was scoped under.
 * Folding these numbers into `PLAN_LIMITS` would have made that
 * indistinguishable in code from a fifth plan tier.
 *
 * Lives outside `src/modules/` on purpose: both the `media` module (the
 * ticket-time quota check) and the `guest` module (the seal-time snapshot)
 * need these same two numbers, and neither module may reach into the
 * other's internals under the module-boundary rule. A single file outside
 * that boundary is the one place both can import from without it being a
 * cross-module dependency at all.
 *
 * The storage figure itself is re-exported from `@tc/contracts` rather than
 * defined here — the web app's "5 MB guest allowance" display text needs
 * the identical number, and `@tc/contracts` is the one place already
 * shared by both. See that export's own doc comment.
 */
export { GUEST_STORAGE_ALLOWANCE_BYTES };

/**
 * 1 year after the capsule opens — same basis as Free's own
 * `mediaRetentionAfterUnlockMs` (`entitlements.ts`'s `ONE_YEAR_MS`), kept as
 * an independent constant rather than importing that one so a future change
 * to Free's term can never silently move Guest's along with it.
 */
export const GUEST_MEDIA_RETENTION_AFTER_UNLOCK_MS = 365.25 * 24 * 60 * 60 * 1000;
