import type { CreateRecipientRequest, PatchRecipientRequest, Recipient } from '@tc/contracts';
import { and, count, eq, gte } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { blocks, capsuleRecipients, capsules, users } from '../../db/schema/index.js';
import { assertWithinRecipientLimit, findOwnedCapsuleOrThrow } from '../capsules/index.js';
import { sendSomethingWaiting } from '../email/index.js';
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

const VELOCITY_LIMIT_ACCOUNT_AGE_DAYS = 7;
const VELOCITY_LIMIT_MAX_RECIPIENTS_PER_DAY = 5;

/**
 * Sender velocity limit — T-22 hardening, plan/03-ARCHITECTURE.md §17 threat
 * #5: "sender velocity limits (new accounts: 5 outbound recipients/day until
 * aged)". "Aged" isn't defined anywhere in the docs; 7 days confirmed with
 * the user rather than assumed.
 *
 * Counted across every capsule the account owns, not per-capsule —
 * `assertWithinRecipientLimit` already enforces the per-capsule plan cap
 * (Free: 3/capsule); this is a separate, account-wide throttle aimed at a
 * fresh account fanning a capsule out to many recipients in a short window,
 * which the per-capsule limit alone doesn't prevent (a new account could
 * still create many capsules, each just under the per-capsule cap).
 */
async function assertWithinVelocityLimit(db: Database, ownerId: string): Promise<void> {
  const [owner] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, ownerId)).limit(1);
  if (!owner) return;

  const accountAgeMs = Date.now() - owner.createdAt.getTime();
  if (accountAgeMs >= VELOCITY_LIMIT_ACCOUNT_AGE_DAYS * 24 * 3_600_000) return;

  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await db
    .select({ value: count() })
    .from(capsuleRecipients)
    .innerJoin(capsules, eq(capsuleRecipients.capsuleId, capsules.id))
    .where(and(eq(capsules.ownerId, ownerId), gte(capsuleRecipients.createdAt, since)));
  const sentToday = rows[0]?.value ?? 0;

  if (sentToday >= VELOCITY_LIMIT_MAX_RECIPIENTS_PER_DAY) {
    throw ApiError.velocityLimitExceeded();
  }
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
  await assertWithinVelocityLimit(db, ownerId);

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
/**
 * Sends the recipient their magic link — the "something is waiting" email.
 * The link is supplied by the caller (the owner's browser), never
 * constructed here: it carries the capsule key in its URL fragment, which
 * the server is never allowed to hold (T-14 decisions log). Shared by both
 * the first real send (`sendAnnounce`, gated on sealed+announceOnSeal) and
 * a manual resend (`resendInvite`, gated only on the recipient being
 * manageable — the owner may resend any time pre-unlock).
 */
async function sendRecipientLink(
  db: Database,
  ownerId: string,
  capsuleId: string,
  recipientId: string,
  link: string,
  auditAction: 'recipient.announced' | 'recipient.invite_resent',
): Promise<void> {
  const [owner] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, ownerId)).limit(1);
  const [capsule] = await db.select({ teaser: capsules.teaser }).from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  const [recipient] = await db
    .select()
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.id, recipientId), eq(capsuleRecipients.capsuleId, capsuleId)))
    .limit(1);
  if (!recipient) {
    throw ApiError.notFound('Recipient not found');
  }
  if (!recipient.email || recipient.status === 'blocked_suppressed') {
    // Masked success — see T-09's block-suppression design (PROGRESS.md decisions log):
    // the owner sees an ordinary success, but nothing is ever actually sent.
    return;
  }

  await sendSomethingWaiting(db, recipient.email, {
    senderName: owner?.displayName ?? 'Someone',
    teaser: capsule?.teaser ?? null,
    link,
  });

  if (recipient.status === 'added') {
    await db.update(capsuleRecipients).set({ status: 'invited' }).where(eq(capsuleRecipients.id, recipientId));
  }

  await audit(db, {
    actorType: 'user',
    actorId: ownerId,
    action: auditAction,
    subjectType: 'capsule',
    subjectId: capsuleId,
    metadata: { recipientId },
  });
}

/** First real announce send — only once the capsule is actually sealed with announceOnSeal set, otherwise there's nothing to announce yet. */
export async function sendAnnounce(db: Database, ownerId: string, capsuleId: string, recipientId: string, link: string): Promise<void> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  if (capsule.state !== 'sealed' || !capsule.announceOnSeal) {
    throw ApiError.announceNotAllowed();
  }
  await sendRecipientLink(db, ownerId, capsuleId, recipientId, link, 'recipient.announced');
}

export async function resendInvite(db: Database, ownerId: string, capsuleId: string, recipientId: string, link: string): Promise<void> {
  const capsule = await findOwnedCapsuleOrThrow(db, ownerId, capsuleId);
  assertCanManageRecipients(capsule);
  await sendRecipientLink(db, ownerId, capsuleId, recipientId, link, 'recipient.invite_resent');
}
