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
}

/** plan/01-PRODUCT.md §20 "Plans" table — kept in sync manually until T-30 wires real billing. */
const PLAN_LIMITS: Record<EntitlementPlan, PlanLimits> = {
  free: {
    activeSealedCapsules: 5,
    storageBytes: 100 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: 1,
    recipientsPerCapsule: 3,
    maxFileSizeBytes: 25 * 1024 * 1024,
  },
  premium: {
    activeSealedCapsules: null,
    storageBytes: 100 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 20,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
  },
  family: {
    activeSealedCapsules: null,
    storageBytes: 200 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 20,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
  },
  business: {
    activeSealedCapsules: null,
    storageBytes: 1024 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 1000,
    maxFileSizeBytes: 20 * 1024 * 1024 * 1024,
  },
  enterprise: {
    activeSealedCapsules: null,
    storageBytes: null,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: null,
    maxFileSizeBytes: null,
  },
};

/** "Plan-limit service reading entitlements (free defaults)" per T-08 ticket text — no row means free. */
export async function getPlanLimits(db: Database, userId: string): Promise<PlanLimits> {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1);
  const plan = (row?.plan ?? 'free') as EntitlementPlan;
  return PLAN_LIMITS[plan];
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
 * kept in sync by modules/media/service.ts on complete/delete) across every
 * capsule the user owns, rather than re-deriving from media_items — capsule
 * rows are cheaper to scan and already carry the aggregate.
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
    throw ApiError.quotaExceeded(`storage_bytes:${limits.storageBytes}`);
  }
}
