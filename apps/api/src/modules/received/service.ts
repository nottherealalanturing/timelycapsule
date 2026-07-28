import type { ReceivedCapsule, ReceivedSection, ReportRequest } from '@tc/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleRecipients, capsules, users } from '../../db/schema/index.js';

type CapsuleRow = typeof capsules.$inferSelect;
type RecipientRow = typeof capsuleRecipients.$inferSelect;

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Which of the three §5.8 sections a claimed recipient row falls into.
 * Returns null for rows that shouldn't surface at all — not yet announced
 * (`added`), or suppressed because the recipient blocked this sender.
 */
function sectionFor(recipient: RecipientRow, capsule: CapsuleRow): ReceivedSection | null {
  if (recipient.status === 'opened') return 'opened';
  if (recipient.status === 'blocked_suppressed' || recipient.status === 'added') return null;
  if (capsule.state === 'unlocked') return 'waiting';
  if (capsule.state === 'sealed') return 'upcoming';
  return null;
}

export async function listReceived(db: Database, userId: string): Promise<ReceivedCapsule[]> {
  const rows = await db
    .select({ recipient: capsuleRecipients, capsule: capsules, senderName: users.displayName, senderEmail: users.email })
    .from(capsuleRecipients)
    .innerJoin(capsules, eq(capsules.id, capsuleRecipients.capsuleId))
    .leftJoin(users, eq(users.id, capsules.ownerId))
    .where(eq(capsuleRecipients.userId, userId));

  const result: ReceivedCapsule[] = [];
  for (const row of rows) {
    const section = sectionFor(row.recipient, row.capsule);
    if (!section) continue;
    result.push({
      recipientId: row.recipient.id,
      capsuleId: row.capsule.id,
      publicId: row.capsule.publicId,
      section,
      senderName: row.senderName ?? 'Someone',
      senderEmail: row.senderEmail ?? null,
      title: row.capsule.title,
      cover: row.capsule.cover as ReceivedCapsule['cover'],
      teaser: row.capsule.teaser,
      unlockAt: isoOrNull(row.capsule.unlockAt),
      firstOpenedAt: isoOrNull(row.recipient.firstOpenedAt),
    });
  }
  return result;
}

/** Same audit-only report as T-15's token-authenticated `/r/:token/report`, just authorized by the claimed recipient row instead of the raw link token. */
export async function reportReceived(db: Database, userId: string, recipientId: string, input: ReportRequest): Promise<void> {
  const [recipient] = await db
    .select()
    .from(capsuleRecipients)
    .where(and(eq(capsuleRecipients.id, recipientId), eq(capsuleRecipients.userId, userId)))
    .limit(1);
  if (!recipient) throw ApiError.notFound('Received capsule not found');

  await audit(db, {
    actorType: 'recipient',
    actorId: recipient.id,
    action: 'capsule.reported',
    subjectType: 'capsule',
    subjectId: recipient.capsuleId,
    metadata: { reason: input.reason, details: input.details },
  });
}
