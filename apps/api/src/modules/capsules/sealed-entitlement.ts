import type { capsules } from '../../db/schema/index.js';
import type { PlanLimits } from './entitlements.js';

type CapsuleRow = typeof capsules.$inferSelect;

/**
 * **The promise a capsule was sealed with.**
 *
 * > People are paying for greater custody and preservation, not for trust.
 * > Trust is never paywalled. Delivery is never paywalled. A sealed capsule
 * > keeps every promise that existed when it was sealed.
 *
 * That last clause is what this file exists to enforce. A storage/retention
 * entitlement belongs to the **individual capsule** from the moment it
 * seals. If the owner then cancels, downgrades, changes plans, stops paying
 * or drifts over their current quota, none of it may reach a capsule that is
 * already sealed — the capsule continues on the terms captured here.
 *
 * ## Why `planAtSeal` is not exported
 *
 * The snapshot records the plan's name, because a human reading a support
 * ticket or an audit trail years from now needs to know what the owner had
 * bought. But the label is **display and diagnostics only**, and the fastest
 * way to destroy the whole model is:
 *
 * ```ts
 * if (snapshot.planAtSeal === 'premium') { ... }   // never do this
 * ```
 *
 * That reintroduces plan-shaped behaviour through the back door and makes
 * the explicit fields decorative. So the accessors below return the
 * behavioural fields and nothing else: there is no exported function from
 * which the label can be read, which makes the mistake awkward to write
 * rather than merely discouraged. Behaviour reads `mediaRetention`,
 * `mediaEntitled`, `archivalPolicy`, `storageAllowanceBytes` — the terms
 * themselves, never the name of the package they came in.
 */

/** Bumped only on a real shape change. Readers treat an unknown (higher) version as `forever` — fail-safe toward preservation. */
export const SEALED_ENTITLEMENT_SCHEMA_VERSION = 1;

export type MediaRetentionPolicy = 'forever' | 'until';
export type ArchivalPolicy = 'never' | 'release_at_retention';

export interface SealedEntitlementSnapshot {
  schemaVersion: number;
  sealedAt: string;
  /**
   * DISPLAY / DIAGNOSTIC ONLY — never the behavioural source of truth.
   * Deliberately unreachable through this module's accessors.
   */
  planAtSeal: string;
  storageAllowanceBytes: number | null;
  mediaEntitled: boolean;
  mediaRetention: {
    policy: MediaRetentionPolicy;
    /**
     * **The promise itself**: "media is kept this long after the capsule
     * opens." Null when the policy is `forever`.
     *
     * The term is stored, not just the date it resolved to, because
     * `unlockAt` can legitimately move after sealing — an owner may extend
     * once, by up to 30 days. The promise made was *"a year after it
     * opens"*, so when the opening moves the date moves with it, and the
     * capsule keeps precisely the promise it was sealed with rather than a
     * stale arithmetic result. Without this field an extend would either
     * silently shorten the retention or, with a short enough period,
     * violate `retentionUntil >= unlockAt` outright.
     */
    afterUnlockMs: number | null;
    /** The term resolved against `unlockAt` as it stood at seal. A record of that moment; `capsules.media_retention_until` is the live one. */
    until: string | null;
  };
  archivalPolicy: ArchivalPolicy;
  maxHorizonMs: number;
}

export interface MediaRetention {
  policy: MediaRetentionPolicy;
  /** Absolute instant the media may be released, as resolved at seal. Null when the policy is `forever`. */
  until: Date | null;
  /** The underlying term in ms after unlock. Null when the policy is `forever`. */
  afterUnlockMs: number | null;
}

/** Perpetual custody — what a capsule gets when it made no retention promise. */
const FOREVER: MediaRetention = { policy: 'forever', until: null, afterUnlockMs: null };

/**
 * Builds the snapshot at seal time.
 *
 * `retentionUntil` is computed by the caller (from the capsule's own
 * `unlockAt` plus the plan's retention period) and passed in as an absolute
 * instant, so the stored promise never has to be re-derived — and can never
 * drift if the plan's period is later changed for new customers.
 */
export function buildSealedEntitlementSnapshot(input: {
  plan: string;
  limits: PlanLimits;
  sealedAt: Date;
  retentionUntil: Date | null;
  hasMedia: boolean;
  maxHorizonMs: number;
}): SealedEntitlementSnapshot {
  // A capsule holding nothing has nothing to release, so it records no
  // retention obligation at all rather than a date that can only ever fire
  // against an empty set.
  const releases = input.hasMedia && input.retentionUntil !== null;

  return {
    schemaVersion: SEALED_ENTITLEMENT_SCHEMA_VERSION,
    sealedAt: input.sealedAt.toISOString(),
    planAtSeal: input.plan,
    storageAllowanceBytes: input.limits.storageBytes,
    mediaEntitled: input.limits.storageBytes === null || input.limits.storageBytes > 0,
    mediaRetention: releases
      ? {
          policy: 'until',
          afterUnlockMs: input.limits.mediaRetentionAfterUnlockMs,
          until: input.retentionUntil!.toISOString(),
        }
      : { policy: 'forever', afterUnlockMs: null, until: null },
    archivalPolicy: releases ? 'release_at_retention' : 'never',
    maxHorizonMs: input.maxHorizonMs,
  };
}

function readSnapshot(capsule: Pick<CapsuleRow, 'sealedEntitlementSnapshot'>): SealedEntitlementSnapshot | null {
  const raw = capsule.sealedEntitlementSnapshot as SealedEntitlementSnapshot | null;
  if (!raw || typeof raw !== 'object') return null;
  // A snapshot written by a future, unknown version is not something this
  // build can reason about. Treating it as absent routes it to the FOREVER
  // default below, which is the only safe direction to be wrong in: worst
  // case bytes are kept that could have been reclaimed. The opposite
  // failure deletes someone's photographs.
  if (raw.schemaVersion !== SEALED_ENTITLEMENT_SCHEMA_VERSION) return null;
  return raw;
}

/**
 * What this capsule promised about how long its media is kept.
 *
 * **A missing snapshot means forever.** Capsules sealed before M4 made no
 * retention promise, so the promise they keep is perpetual custody — the
 * founding principle read literally. Nothing may ever retroactively release
 * media from a capsule that was sealed before this system existed.
 */
export function getMediaRetention(capsule: Pick<CapsuleRow, 'sealedEntitlementSnapshot'>): MediaRetention {
  const snapshot = readSnapshot(capsule);
  if (!snapshot) return FOREVER;
  if (snapshot.mediaRetention.policy !== 'until' || !snapshot.mediaRetention.until) return FOREVER;
  return {
    policy: 'until',
    until: new Date(snapshot.mediaRetention.until),
    afterUnlockMs: snapshot.mediaRetention.afterUnlockMs,
  };
}

/** Whether this capsule's media may ever be released automatically. Legacy (null snapshot) is always `false`. */
export function releasesAutomatically(capsule: Pick<CapsuleRow, 'sealedEntitlementSnapshot'>): boolean {
  const snapshot = readSnapshot(capsule);
  if (!snapshot) return false;
  return snapshot.archivalPolicy === 'release_at_retention' && Boolean(snapshot.mediaRetention.until);
}

/** The storage allowance this capsule was sealed under. Null = unlimited, or unknown (legacy). For display; never a gate on delivery. */
export function getSealedStorageAllowanceBytes(capsule: Pick<CapsuleRow, 'sealedEntitlementSnapshot'>): number | null {
  return readSnapshot(capsule)?.storageAllowanceBytes ?? null;
}

/** True when this capsule was sealed before the retention system existed — its media is kept indefinitely. */
export function isLegacySnapshot(capsule: Pick<CapsuleRow, 'sealedEntitlementSnapshot'>): boolean {
  return readSnapshot(capsule) === null;
}
