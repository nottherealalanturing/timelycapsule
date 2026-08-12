import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { capsuleRecipients, capsules, entitlements } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';

export type EntitlementPlan = 'free' | 'premium' | 'family' | 'business' | 'enterprise';

export interface PlanLimits {
  /** null = unlimited */
  activeSealedCapsules: number | null;
  storageBytes: number | null;
  /** Free plan allows only one of {place, passphrase} stacked per capsule; paid plans allow both (plan/01-PRODUCT.md §20). */
  placeOrPassphraseSealsPerCapsule: number | null;
  recipientsPerCapsule: number | null;
  /** Per-file cap enforced at ticket-creation time, T-10 — not in plan/01-PRODUCT.md §20, chosen to keep single uploads well under the overall storage quota. */
  maxFileSizeBytes: number | null;
  /**
   * **M4.** How long after a capsule unlocks its media is kept before being
   * released. `null` = forever (media is never automatically released).
   *
   * A *period*, resolved to an absolute instant at seal and frozen into the
   * capsule's snapshot. That indirection is the whole point: changing this
   * number later moves the promise for capsules sealed afterwards and
   * cannot touch a single capsule already sealed. It is also why arbitrary
   * future retention lengths need no new code — a purchased retention pack
   * is a different number here (or a per-user override alongside
   * `storageQuotaBytes`), never a branch on the plan's name.
   */
  mediaRetentionAfterUnlockMs: number | null;
}

const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** plan/01-PRODUCT.md §20 "Plans" table — kept in sync manually until T-30 wires real billing. */
const PLAN_LIMITS: Record<EntitlementPlan, PlanLimits> = {
  free: {
    activeSealedCapsules: 5,
    storageBytes: 100 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: 1,
    recipientsPerCapsule: 3,
    maxFileSizeBytes: 25 * 1024 * 1024,
    // Free keeps media for a year after the capsule opens. The letter,
    // metadata, history and replies are kept regardless and forever — only
    // the bytes are reclaimed.
    mediaRetentionAfterUnlockMs: ONE_YEAR_MS,
  },
  premium: {
    activeSealedCapsules: null,
    storageBytes: 100 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 20,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
    mediaRetentionAfterUnlockMs: null,
  },
  family: {
    activeSealedCapsules: null,
    storageBytes: 200 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 20,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
    mediaRetentionAfterUnlockMs: null,
  },
  business: {
    activeSealedCapsules: null,
    storageBytes: 1024 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 1000,
    maxFileSizeBytes: 20 * 1024 * 1024 * 1024,
    mediaRetentionAfterUnlockMs: null,
  },
  enterprise: {
    activeSealedCapsules: null,
    storageBytes: null,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: null,
    maxFileSizeBytes: null,
    mediaRetentionAfterUnlockMs: null,
  },
};

/**
 * "Plan-limit service reading entitlements (free defaults)" per T-08 ticket
 * text — no row means free.
 *
 * **M4 wires `entitlements.storage_quota_bytes`, which until now was a real,
 * `notNull` column that nothing on earth read.** It is the seam storage packs
 * need: a purchased 10/50/100/500 GB pack becomes a per-user number in that
 * column, and the plan label stays a label. Without it, "Premium has packs"
 * could only have been expressed as a branch on the plan's name — the exact
 * thing the sealed-snapshot model exists to prevent.
 *
 * The plan's own figure remains the default when no override is stored.
 */
export async function getPlanLimits(db: Database, userId: string): Promise<PlanLimits> {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  const plan = (row?.plan ?? 'free') as EntitlementPlan;
  const base = PLAN_LIMITS[plan];

  // 0 is a legitimate override (an account entitled to no media at all), so
  // this checks for a stored value rather than truthiness.
  const override = row?.storageQuotaBytes;
  if (override === null || override === undefined) return base;
  return { ...base, storageBytes: override };
}

const ACTIVE_SEALED_STATES = ['sealed', 'unlocked'] as const;

/** Throws `quota_exceeded` if sealing this capsule would exceed the owner's active-sealed-capsule limit. */
export async function assertWithinActiveCapsuleLimit(db: Database, userId: string): Promise<void> {
  const limits = await getPlanLimits(db, userId);
  if (limits.activeSealedCapsules === null) return;

  const rows = await db
    .select({ value: count() })
    .from(capsules)
    .where(and(eq(capsules.ownerId, userId), inArray(capsules.state, [...ACTIVE_SEALED_STATES])));
  const value = rows[0]?.value ?? 0;

  if (value >= limits.activeSealedCapsules) {
    throw ApiError.quotaExceeded(`active_sealed_capsules:${limits.activeSealedCapsules}`);
  }
}

/** Throws `quota_exceeded` if adding another recipient would exceed the owner's per-capsule recipient limit. */
export async function assertWithinRecipientLimit(db: Database, userId: string, capsuleId: string): Promise<void> {
  const limits = await getPlanLimits(db, userId);
  if (limits.recipientsPerCapsule === null) return;

  const rows = await db.select({ value: count() }).from(capsuleRecipients).where(eq(capsuleRecipients.capsuleId, capsuleId));
  const value = rows[0]?.value ?? 0;

  if (value >= limits.recipientsPerCapsule) {
    throw ApiError.quotaExceeded(`recipients_per_capsule:${limits.recipientsPerCapsule}`);
  }
}

/** Throws `file_too_large` if a single upload exceeds the owner's per-file size cap. */
export async function assertFileWithinSizeLimit(db: Database, userId: string, fileSizeBytes: number): Promise<void> {
  const limits = await getPlanLimits(db, userId);
  if (limits.maxFileSizeBytes !== null && fileSizeBytes > limits.maxFileSizeBytes) {
    throw ApiError.fileTooLarge(limits.maxFileSizeBytes);
  }
}

/**
 * Throws `quota_exceeded` if adding `additionalBytes` would push the owner
 * over their storage quota. Sums `capsules.size_bytes` (the running total
 * kept in sync by modules/media/service.ts on complete/delete/release)
 * across every capsule the user owns, rather than re-deriving from
 * media_items — capsule rows are cheaper to scan and already carry the
 * aggregate.
 *
 * ## What this gate is, and what it is emphatically not (M4)
 *
 * This is the **live** entitlement, and it governs exactly one thing:
 * whether *new* bytes may be added. It counts everything currently in
 * storage, sealed capsules included, because those bytes are really there
 * and really cost something.
 *
 * It is **never** consulted for anything about a capsule that is already
 * sealed. Sealing, unlocking, notifying, revealing and retaining all read
 * the capsule's own sealed snapshot (`sealed-entitlement.ts`), so a
 * downgrade, a cancellation, a lapsed card or an over-quota account cannot
 * shorten a promise already made, cannot release media early, and — hard
 * rule 5 — cannot stop a capsule being delivered. An owner who drops below
 * their current usage keeps every sealed capsule intact and simply cannot
 * add anything new until they reduce usage or raise the allowance.
 *
 * Released media stops counting the moment it is released, because the
 * bytes are genuinely gone.
 */
export async function assertWithinStorageQuota(db: Database, userId: string, additionalBytes: number): Promise<void> {
  const limits = await getPlanLimits(db, userId);
  if (limits.storageBytes === null) return;

  const rows = await db
    .select({ value: sql<number>`coalesce(sum(${capsules.sizeBytes}), 0)` })
    .from(capsules)
    .where(eq(capsules.ownerId, userId));
  const used = Number(rows[0]?.value ?? 0);

  if (used + additionalBytes > limits.storageBytes) {
    // Carries used/limit so the client can say what is actually wrong
    // ("you are over by 240 MB") instead of a bare refusal — an owner who
    // downgraded needs to know the sealed capsules are safe and that the
    // only blocked action is adding something new.
    throw ApiError.quotaExceeded(`storage_bytes:${limits.storageBytes}:used:${used}`);
  }
}
