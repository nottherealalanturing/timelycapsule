import type { Capsule, CapsuleActivityResponse, ExtendCapsuleRequest } from '@tc/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { auditEvents, capsuleRecipients, capsules, mediaItems, scheduledActions } from '../../db/schema/index.js';
import { assertWithinActiveCapsuleLimit } from './entitlements.js';
import { validateSeals } from './seals.js';
import { getPlanLimits } from './entitlements.js';
import {
  assertCanExtend,
  assertCanRestore,
  assertCanSeal,
  assertCanTrash,
  assertCanWithdraw,
  assertExtendWithinBounds,
  assertUnlockAtWithinBounds,
} from './state-machine.js';
import { toCapsule } from './mappers.js';
import { findOwnedCapsuleOrThrow } from './service.js';

const PURGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type CapsuleRow = typeof capsules.$inferSelect;

async function hasOpenedRecipient(db: Database, capsuleId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: capsuleRecipients.id })
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.capsuleId, capsuleId), eq(capsuleRecipients.status, 'opened')))
    .limit(1);
  return Boolean(row);
}

async function hasThirdPartyRecipients(db: Database, capsuleId: string, type: CapsuleRow['type']): Promise<boolean> {
  if (type === 'self') return false;
  const [row] = await db
    .select({ id: capsuleRecipients.id })
    .from(capsuleRecipients)
    .where(eq(capsuleRecipients.capsuleId, capsuleId))
    .limit(1);
  return Boolean(row);
}

export async function sealCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanSeal(row);

  if (!row.unlockAt) {
    throw ApiError.validationFailed({ unlockAt: 'unlockAt must be set before sealing' });
  }
  assertUnlockAtWithinBounds(row.unlockAt);

  const limits = await getPlanLimits(db, ownerId);
  validateSeals(row.seals as Parameters<typeof validateSeals>[0], row.type, limits);

  // Media pipeline lands in T-10 — no capsule can have media rows yet, but
  // this check is written forward-compatibly: any non-'ready' media blocks sealing.
  const media = await db.select({ status: mediaItems.status }).from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
  if (media.some((m) => m.status !== 'ready')) {
    throw ApiError.uploadIncomplete();
  }

  await assertWithinActiveCapsuleLimit(db, ownerId);

  const now = new Date();
  const [sealed] = (await db
    .update(capsules)
    .set({ state: 'sealed', sealedAt: now, updatedAt: now })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  await db.insert(scheduledActions).values({
    kind: 'capsule_unlock',
    subjectId: capsuleId,
    runAt: row.unlockAt,
    idempotencyKey: `capsule_unlock:${capsuleId}`,
  });

  if (row.announceOnSeal) {
    await db.insert(scheduledActions).values({
      kind: 'announce',
      subjectId: capsuleId,
      runAt: now,
      idempotencyKey: `announce:${capsuleId}:${now.getTime()}`,
    });
  }

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.sealed', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(sealed);
}

export async function withdrawCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  const opened = await hasOpenedRecipient(db, capsuleId);
  assertCanWithdraw(row, opened);

  const now = new Date();
  const [updated] = (await db
    .update(capsules)
    .set({ state: 'withdrawn', withdrawnAt: now, purgeAfter: new Date(now.getTime() + PURGE_RETENTION_MS), updatedAt: now })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  await db
    .update(scheduledActions)
    .set({ state: 'cancelled' })
    .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'capsule_unlock'), eq(scheduledActions.state, 'pending')));

  await db.insert(scheduledActions).values({
    kind: 'trash_purge',
    subjectId: capsuleId,
    runAt: updated.purgeAfter!,
    idempotencyKey: `trash_purge:${capsuleId}:${now.getTime()}`,
  });

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.withdrawn', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}

export async function extendCapsule(
  db: Database,
  ownerId: string,
  capsuleId: string,
  input: ExtendCapsuleRequest,
): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanExtend(row);

  const newUnlockAt = new Date(input.newUnlockAt);
  assertExtendWithinBounds(row.unlockAt!, newUnlockAt);

  const [updated] = (await db
    .update(capsules)
    .set({ unlockAt: newUnlockAt, extendedOnce: true, updatedAt: new Date() })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  await db
    .update(scheduledActions)
    .set({ runAt: newUnlockAt })
    .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'capsule_unlock'), eq(scheduledActions.state, 'pending')));

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'capsule.extended',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { newUnlockAt: newUnlockAt.toISOString() },
  });
  return toCapsule(updated);
}

export async function trashCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  const [opened, thirdParty] = await Promise.all([
    hasOpenedRecipient(db, capsuleId),
    hasThirdPartyRecipients(db, capsuleId, row.type),
  ]);
  assertCanTrash(row, { anyRecipientOpened: opened, hasThirdPartyRecipients: thirdParty });

  const now = new Date();
  const [updated] = (await db
    .update(capsules)
    .set({ trashedAt: now, purgeAfter: new Date(now.getTime() + PURGE_RETENTION_MS), updatedAt: now })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.trashed', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}

export async function restoreCapsule(db: Database, ownerId: string, capsuleId: string): Promise<Capsule> {
  const row = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanRestore(row);

  const [updated] = (await db
    .update(capsules)
    .set({ trashedAt: null, purgeAfter: null, updatedAt: new Date() })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  await audit(db, { actorType: 'user', actorId: ownerId, action: 'capsule.restored', subjectType: 'capsule', subjectId: capsuleId });
  return toCapsule(updated);
}

export async function getCapsuleActivity(db: Database, ownerId: string, capsuleId: string): Promise<CapsuleActivityResponse> {
  await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.subjectType, 'capsule'), eq(auditEvents.subjectId, capsuleId)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);

  return {
    data: rows.map((r) => ({
      action: r.action,
      actorType: r.actorType,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
