import { and, count, eq, inArray } from 'drizzle-orm';
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
}

/** plan/01-PRODUCT.md §20 "Plans" table — kept in sync manually until T-30 wires real billing. */
const PLAN_LIMITS: Record<EntitlementPlan, PlanLimits> = {
  free: {
    activeSealedCapsules: 5,
    storageBytes: 100 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: 1,
    recipientsPerCapsule: 3,
  },
  premium: {
    activeSealedCapsules: null,
    storageBytes: 100 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 20,
  },
  family: {
    activeSealedCapsules: null,
    storageBytes: 200 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 20,
  },
  business: {
    activeSealedCapsules: null,
    storageBytes: 1024 * 1024 * 1024 * 1024,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: 1000,
  },
  enterprise: {
    activeSealedCapsules: null,
    storageBytes: null,
    placeOrPassphraseSealsPerCapsule: null,
    recipientsPerCapsule: null,
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
