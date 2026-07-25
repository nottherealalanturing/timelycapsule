import type { CreateRecipientRequest, PatchRecipientRequest, Recipient } from '@tc/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { blocks, capsuleRecipients, capsules, users } from '../../db/schema/index.js';
import { assertWithinRecipientLimit, findOwnedCapsuleOrThrow } from '../capsules/index.js';
import { generateAccessToken, hashAccessToken } from './access-token.js';
import { toRecipient } from './mappers.js';

type CapsuleRow = typeof capsules.$inferSelect;
type RecipientRow = typeof capsuleRecipients.$inferSelect;

/** Recipients can be added/edited/removed pre-unlock — draft or sealed — never once unlocked/expired/withdrawn (03-ARCHITECTURE.md §8 invariant 1). */
function assertCanManageRecipients(capsule: CapsuleRow): void {
  if (capsule.state === 'unlocked' || capsule.state === 'expired' || capsule.state === 'withdrawn') {
    throw ApiError.recipientLocked();
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function findExistingRecipient(
  db: Database,
  capsuleId: string,
  input: { email?: string; phone?: string },
  excludeRecipientId?: string,
): Promise<RecipientRow | undefined> {
  const rows = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.capsuleId, capsuleId));
  return rows.find((r) => {
    if (excludeRecipientId && r.id === excludeRecipientId) return false;
    if (input.email && r.email && r.email.toLowerCase() === input.email.toLowerCase()) return true;
    if (input.phone && r.phone && normalizePhone(r.phone) === normalizePhone(input.phone)) return true;
    return false;
  });
}

/**
 * Recipient block suppression (plan/03-ARCHITECTURE.md §17 threat #5): if
 * the person at this email has an account and has blocked the capsule
 * owner's email, the recipient row is still created (the sender sees
 * ordinary success — "masked success") but pre-marked `blocked_suppressed`
 * so nothing is ever actually delivered to them.
 */
async function isBlockedByRecipient(db: Database, ownerEmail: string, recipientEmail: string): Promise<boolean> {
  const [recipientUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, recipientEmail)).limit(1);
  if (!recipientUser) return false;

  const [block] = await db
    .select({ blockerUserId: blocks.blockerUserId })
    .from(blocks)
    .where(and(eq(blocks.blockerUserId, recipientUser.id), eq(blocks.blockedEmail, ownerEmail)))
    .limit(1);
  return Boolean(block);
}

export async function listRecipients(db: Database, ownerId: string, capsuleId: string): Promise<Recipient[]> {
  await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  const rows = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.capsuleId, capsuleId));
  return rows.map(toRecipient);
}

export async function createRecipient(
  db: Database,
  ownerId: string,
  capsuleId: string,
  input: CreateRecipientRequest,
): Promise<{ recipient: Recipient; accessToken: string }> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanManageRecipients(capsule);

  const existing = await findExistingRecipient(db, capsuleId, input);
  if (existing) {
    throw ApiError.recipientAlreadyAdded();
  }

  await assertWithinRecipientLimit(db, ownerId, capsuleId);

  let suppressed = false;
  if (input.email) {
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
    if (owner) {
      suppressed = await isBlockedByRecipient(db, owner.email, input.email);
    }
  }

  const rawToken = generateAccessToken();
  const [row] = (await db
    .insert(capsuleRecipients)
    .values({
      capsuleId,
      email: input.email,
      phone: input.phone,
      displayName: input.displayName,
      isFallback: input.isFallback ?? false,
      fallbackAfter: input.fallbackAfter,
      accessTokenHash: hashAccessToken(rawToken),
      status: suppressed ? 'blocked_suppressed' : 'added',
    })
    .returning()) as [RecipientRow];

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: suppressed ? 'recipient.blocked_suppressed' : 'recipient.added',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { recipientId: row.id },
  });

  return { recipient: toRecipient(row), accessToken: rawToken };
}

export async function patchRecipient(
  db: Database,
  ownerId: string,
  capsuleId: string,
  recipientId: string,
  input: PatchRecipientRequest,
): Promise<Recipient> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanManageRecipients(capsule);

  const [current] = await db
    .select()
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.id, recipientId), eq(capsuleRecipients.capsuleId, capsuleId)))
    .limit(1);
  if (!current) {
    throw ApiError.notFound('Recipient not found');
  }

  const existing = await findExistingRecipient(db, capsuleId, { email: input.email }, recipientId);
  if (existing) {
    throw ApiError.recipientAlreadyAdded();
  }

  const [updated] = (await db
    .update(capsuleRecipients)
    .set({ email: input.email })
    .where(eq(capsuleRecipients.id, recipientId))
    .returning()) as [RecipientRow];

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'recipient.updated',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { recipientId },
  });

  return toRecipient(updated);
}

export async function deleteRecipient(db: Database, ownerId: string, capsuleId: string, recipientId: string): Promise<void> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanManageRecipients(capsule);

  const result = await db
    .delete(capsuleRecipients)
    .where(and(eq(capsuleRecipients.id, recipientId), eq(capsuleRecipients.capsuleId, capsuleId)))
    .returning({ id: capsuleRecipients.id });
  if (result.length === 0) {
    throw ApiError.notFound('Recipient not found');
  }

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'recipient.removed',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { recipientId },
  });
}

/** Stub per T-09 ticket text — real email delivery is T-14's job. */
export async function resendInvite(db: Database, ownerId: string, capsuleId: string, recipientId: string): Promise<void> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanManageRecipients(capsule);

  const [recipient] = await db
    .select({ id: capsuleRecipients.id })
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.id, recipientId), eq(capsuleRecipients.capsuleId, capsuleId)))
    .limit(1);
  if (!recipient) {
    throw ApiError.notFound('Recipient not found');
  }

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: 'recipient.invite_resent',
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { recipientId },
  });
}
