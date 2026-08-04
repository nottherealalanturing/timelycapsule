/**
 * What this entry point can actually do.
 *
 * There is one Capsule Creation experience. The landing page's guest flow and
 * the authenticated composer render the *same* components against the same
 * `CapsuleDraft` interface; they differ only in what they are allowed to offer
 * and in what backs the draft (the API, or guest session storage).
 *
 * Capabilities are resolved at the container and passed down, so a component
 * never asks "am I in guest mode?" — it asks whether the thing it renders is
 * available. That keeps the guest flow from drifting into a second composer,
 * which is exactly what happened the first time.
 *
 * Unavailable does not mean hidden. `01 §4.1b` phrases guest limits as
 * invitations upward rather than absences, and a capability the writer cannot
 * see cannot be a reason to sign up.
 */
export interface ComposerCapabilities {
  /** Files and voice notes. Guests have no media pipeline. */
  enclosures: boolean;
  /** Place-as-memory — where this was written. */
  placeMemory: boolean;
  /** Named recipients and email delivery. Guests hand over a link themselves. */
  recipients: boolean;
  /** Place, passphrase and identity gates, and expiry. */
  conditions: boolean;
  /** How far out this entry point may schedule. */
  maxHorizonMs: number;
  /** Shown against anything unavailable. */
  upgradeHint: string;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const ACCOUNT_CAPABILITIES: ComposerCapabilities = {
  enclosures: true,
  placeMemory: true,
  recipients: true,
  conditions: true,
  maxHorizonMs: 50 * 365.25 * 24 * 60 * 60 * 1000,
  upgradeHint: '',
};

export const GUEST_CAPABILITIES: ComposerCapabilities = {
  enclosures: false,
  placeMemory: false,
  recipients: false,
  conditions: false,
  maxHorizonMs: YEAR_MS,
  upgradeHint: 'Free account',
};
