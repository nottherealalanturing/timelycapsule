import type { CapsuleDeletionDecision, DeletionPreviewItem, StorageResponse } from '@tc/contracts';
import { and, desc, eq, ne, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleRecipients, capsules, scheduledActions, users } from '../../db/schema/index.js';
import { getPlanLimits, withdrawCapsule } from '../capsules/index.js';
import { verifyPassword } from '../auth/index.js';
import { getStorageAdapter } from '../media/index.js';

const ACCOUNT_PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR_UPLOAD_TTL_SECONDS = 15 * 60;

type CapsuleRow = typeof capsules.$inferSelect;

/** Capsules with at least one real (non-suppressed) recipient — the ones a stranger's account has a stake in. */
async function capsulesWithRealRecipients(db: Database, userId: string): Promise<CapsuleRow[]> {
  const owned = await db.select().from(capsules).where(eq(capsules.ownerId, userId));
  const withRecipients: CapsuleRow[] = [];
  for (const capsule of owned) {
    const [recipient] = await db
      .select({ id: capsuleRecipients.id })
      .from(capsuleRecipients)
      .where(and(eq(capsuleRecipients.capsuleId, capsule.id), ne(capsuleRecipients.status, 'blocked_suppressed')))
      .limit(1);
    if (recipient) withRecipients.push(capsule);
  }
  return withRecipients;
}

export async function getStorage(db: Database, userId: string): Promise<StorageResponse> {
  const limits = await getPlanLimits(db, userId);

  const [usedRow] = await db
    .select({ value: sql<number>`coalesce(sum(${capsules.sizeBytes}), 0)`.mapWith(Number) })
    .from(capsules)
    .where(eq(capsules.ownerId, userId));

  const largest = await db
    .select({ id: capsules.id, publicId: capsules.publicId, title: capsules.title, sizeBytes: capsules.sizeBytes })
    .from(capsules)
    .where(eq(capsules.ownerId, userId))
    .orderBy(desc(capsules.sizeBytes))
    .limit(5);

  return { usedBytes: usedRow?.value ?? 0, quotaBytes: limits.storageBytes, largest };
}

export async function createAvatarUploadTicket(
  db: Database,
  userId: string,
  contentType: string,
): Promise<{ uploadUrl: string; avatarKey: string }> {
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const avatarKey = `avatars/${userId}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await getStorageAdapter().getSignedPutUrl(avatarKey, {
    expiresInSeconds: AVATAR_UPLOAD_TTL_SECONDS,
    contentType,
  });
  return { uploadUrl, avatarKey };
}

/** One export at a time — a pending/enqueued `data_export` row is enough, no need to queue a pile of them. */
export async function requestExport(db: Database, userId: string): Promise<{ jobId: string }> {
  const [existing] = await db
    .select({ id: scheduledActions.id })
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.subjectId, userId),
        eq(scheduledActions.kind, 'data_export'),
        notInArray(scheduledActions.state, ['done', 'failed', 'cancelled']),
      ),
    )
    .limit(1);
  if (existing) return { jobId: existing.id };

  const [row] = await db
    .insert(scheduledActions)
    .values({ kind: 'data_export', subjectId: userId, runAt: new Date() })
    .returning({ id: scheduledActions.id });
  return { jobId: row!.id };
}

/** The F8 "consequences screen" — sealed capsules with real recipients, each needing an explicit deliver/withdraw choice. Already-unlocked capsules with recipients are preserved automatically (nothing to decide); capsules with no real recipients just go with the account. */
export async function getDeletionPreview(db: Database, userId: string): Promise<DeletionPreviewItem[]> {
  const candidates = await capsulesWithRealRecipients(db, userId);
  const needsDecision = candidates.filter((c) => c.state === 'sealed');

  const result: DeletionPreviewItem[] = [];
  for (const capsule of needsDecision) {
    const recipients = await db
      .select({ id: capsuleRecipients.id })
      .from(capsuleRecipients)
      .where(and(eq(capsuleRecipients.capsuleId, capsule.id), ne(capsuleRecipients.status, 'blocked_suppressed')));
    result.push({
      id: capsule.id,
      title: capsule.title,
      cover: capsule.cover as DeletionPreviewItem['cover'],
      recipientCount: recipients.length,
    });
  }
  return result;
}

export async function requestAccountDeletion(
  db: Database,
  userId: string,
  password: string,
  capsuleDecisions: CapsuleDeletionDecision[],
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw ApiError.invalidCredentials();
  }

  const candidates = await capsulesWithRealRecipients(db, userId);
  const sealedNeedingDecision = candidates.filter((c) => c.state === 'sealed');
  const decisionByCapsule = new Map(capsuleDecisions.map((d) => [d.capsuleId, d.action]));

  for (const capsule of sealedNeedingDecision) {
    if (!decisionByCapsule.has(capsule.id)) {
      throw ApiError.validationFailed(`Missing a deliver/withdraw decision for capsule ${capsule.id}`);
    }
  }

  for (const capsule of sealedNeedingDecision) {
    const decision = decisionByCapsule.get(capsule.id)!;
    if (decision === 'withdraw') {
      // Irreversible now, same as any other withdraw — even if the account
      // deletion itself is later cancelled by logging back in.
      await withdrawCapsule(db, userId, capsule.id);
    } else {
      await db.update(capsules).set({ deletionDecision: 'deliver' }).where(eq(capsules.id, capsule.id));
    }
  }

  // Already-unlocked capsules with real recipients are auto-preserved —
  // no decision needed, just mark them for anonymization at purge time.
  const unlockedWithRecipients = candidates.filter((c) => c.state === 'unlocked');
  for (const capsule of unlockedWithRecipients) {
    await db.update(capsules).set({ deletionDecision: 'deliver' }).where(eq(capsules.id, capsule.id));
  }

  await db
    .update(users)
    .set({ status: 'pending_deletion', deletionRequestedAt: new Date() })
    .where(eq(users.id, userId));

  await db.insert(scheduledActions).values({
    kind: 'account_purge',
    subjectId: userId,
    runAt: new Date(Date.now() + ACCOUNT_PURGE_DELAY_MS),
  });

  await audit(db, { actorType: 'user', actorId: userId, action: 'account.deletion_requested', subjectType: 'user', subjectId: userId });
}

/** "30-day pending window (login cancels)" — called from modules/auth's login() the moment a pending_deletion user successfully authenticates again. */
export async function cancelAccountDeletion(db: Database, userId: string): Promise<void> {
  await db
    .update(scheduledActions)
    .set({ state: 'cancelled' })
    .where(and(eq(scheduledActions.subjectId, userId), eq(scheduledActions.kind, 'account_purge'), eq(scheduledActions.state, 'pending')));

  await db
    .update(capsules)
    .set({ deletionDecision: null })
    .where(and(eq(capsules.ownerId, userId), eq(capsules.deletionDecision, 'deliver')));

  await db.update(users).set({ status: 'active', deletionRequestedAt: null }).where(eq(users.id, userId));

  await audit(db, { actorType: 'user', actorId: userId, action: 'account.deletion_cancelled', subjectType: 'user', subjectId: userId });
}
