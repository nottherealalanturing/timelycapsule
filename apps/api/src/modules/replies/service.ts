import type { Reply, ReplyThread } from '@tc/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleReplies, capsuleRecipients, capsules, users } from '../../db/schema/index.js';
import { hashAccessToken } from '../recipients/index.js';
import { sendReplyReceived } from '../email/index.js';
import { writeNotification } from '../notifications/index.js';

type ReplyRow = typeof capsuleReplies.$inferSelect;

function toReply(row: ReplyRow): Reply {
  return {
    id: row.id,
    author: row.author,
    bodyEnc: row.bodyEnc,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A capsule must have opened before anything can be written back into it.
 *
 * Not a formality: before the unlock the recipient has not read the letter,
 * so a "reply" would be a message to someone about something they have not
 * been shown — and it would sit in the same thread the letter later arrives
 * in, out of order, having answered nothing.
 */
function assertOpened(state: string): void {
  if (state !== 'unlocked') {
    throw ApiError.forbidden('This capsule has not opened yet');
  }
}

/**
 * Tells the sender a reply is waiting, and **says nothing about what it says.**
 *
 * This is the whole discipline of the feature in one function. The body is
 * ciphertext we cannot read, and even the fact of having read it is not ours
 * to relay: the previous implementation put the reply's text directly into
 * the notification title, the notification body, and the email, so a reply
 * written in confidence was legible to anyone with a look at the sender's
 * inbox, their lock screen, or our database. A notice may say that something
 * arrived. It may not say what.
 */
async function noticeToSender(
  db: Database,
  capsule: typeof capsules.$inferSelect,
  recipient: typeof capsuleRecipients.$inferSelect,
): Promise<void> {
  // A guest-sealed capsule has no account to notify. The reply is stored and
  // waiting; the guest reads it on their own capsule page, which is the only
  // place they have. Silently dropping the reply — which is what the previous
  // `if (capsule.ownerId)` did — is not the same thing as not notifying.
  if (!capsule.ownerId) return;

  const who = recipient.displayName ?? recipient.email ?? recipient.phone ?? 'Someone';

  await writeNotification(db, {
    userId: capsule.ownerId,
    category: 'social',
    title: `${who} replied`,
    // Deliberately absent. There is nothing to put here that would not be
    // the contents of the reply.
    body: undefined,
    data: { capsuleId: capsule.id, recipientId: recipient.id },
  });

  const [ownerUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, capsule.ownerId)).limit(1);
  if (!ownerUser) return;

  await sendReplyReceived(db, ownerUser.email, {
    recipientName: who,
    capsuleUrl: `${process.env.APP_URL ?? 'http://localhost:3001'}/capsule/${capsule.id}`,
  });
}

async function findRecipientByToken(db: Database, rawToken: string) {
  const tokenHash = hashAccessToken(rawToken);
  const [recipient] = await db
    .select()
    .from(capsuleRecipients)
    .where(eq(capsuleRecipients.accessTokenHash, tokenHash))
    .limit(1);
  if (!recipient || recipient.status === 'blocked_suppressed') {
    throw ApiError.notFound('Capsule not found');
  }
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, recipient.capsuleId)).limit(1);
  if (!capsule) throw ApiError.notFound('Capsule not found');
  return { recipient, capsule };
}

/** The recipient writes back, holding only their link. */
export async function writeRecipientReply(db: Database, rawToken: string, bodyEnc: string): Promise<Reply> {
  const { recipient, capsule } = await findRecipientByToken(db, rawToken);
  assertOpened(capsule.state);

  const [row] = await db
    .insert(capsuleReplies)
    .values({ capsuleId: capsule.id, recipientId: recipient.id, author: 'recipient', bodyEnc })
    .returning();

  try {
    await noticeToSender(db, capsule, recipient);
  } catch {
    // Best-effort. The reply is already recorded, and a failed notice must
    // never look to the writer like a failure to send.
  }

  return toReply(row!);
}

/** The correspondence as the recipient sees it — their thread, and only theirs. */
export async function listRepliesForRecipient(db: Database, rawToken: string): Promise<Reply[]> {
  const { recipient, capsule } = await findRecipientByToken(db, rawToken);
  if (capsule.state !== 'unlocked') return [];

  const rows = await db
    .select()
    .from(capsuleReplies)
    .where(eq(capsuleReplies.recipientId, recipient.id))
    .orderBy(asc(capsuleReplies.createdAt));
  return rows.map(toReply);
}

/**
 * Every correspondence this capsule opened into, one per recipient.
 *
 * Threads with nothing in them are included: a capsule sent to three people
 * where one wrote back should show that the other two have not, which is a
 * fact about the capsule the sender can otherwise only infer from an absence.
 */
export async function listThreadsForCapsule(db: Database, capsuleId: string): Promise<ReplyThread[]> {
  const recipients = await db
    .select()
    .from(capsuleRecipients)
    .where(eq(capsuleRecipients.capsuleId, capsuleId))
    .orderBy(asc(capsuleRecipients.createdAt));

  const rows = await db
    .select()
    .from(capsuleReplies)
    .where(eq(capsuleReplies.capsuleId, capsuleId))
    .orderBy(asc(capsuleReplies.createdAt));

  return recipients.map((r) => ({
    recipientId: r.id,
    recipientLabel: r.displayName ?? r.email ?? r.phone ?? null,
    replies: rows.filter((row) => row.recipientId === r.id).map(toReply),
  }));
}

/** The sender answers a particular correspondence. */
export async function writeSenderReply(
  db: Database,
  capsuleId: string,
  recipientId: string,
  bodyEnc: string,
): Promise<Reply> {
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!capsule) throw ApiError.notFound('Capsule not found');
  assertOpened(capsule.state);

  const [recipient] = await db
    .select()
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.id, recipientId), eq(capsuleRecipients.capsuleId, capsuleId)))
    .limit(1);
  if (!recipient) throw ApiError.notFound('No such recipient on this capsule');

  const [row] = await db
    .insert(capsuleReplies)
    .values({ capsuleId, recipientId, author: 'sender', bodyEnc })
    .returning();

  return toReply(row!);
}
