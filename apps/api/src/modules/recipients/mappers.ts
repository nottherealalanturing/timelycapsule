import type { Recipient } from '@tc/contracts';
import type { capsuleRecipients } from '../../db/schema/index.js';

type RecipientRow = typeof capsuleRecipients.$inferSelect;

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function toRecipient(row: RecipientRow): Recipient {
  return {
    id: row.id,
    capsuleId: row.capsuleId,
    userId: row.userId,
    email: row.email,
    phone: row.phone,
    displayName: row.displayName,
    status: row.status,
    firstOpenedAt: isoOrNull(row.firstOpenedAt),
    lastViewedAt: isoOrNull(row.lastViewedAt),
    resolvedUnlockAt: isoOrNull(row.resolvedUnlockAt),
    verificationRequired: row.verificationRequired,
    verifiedAt: isoOrNull(row.verifiedAt),
    isFallback: row.isFallback,
    fallbackAfter: row.fallbackAfter,
    createdAt: row.createdAt.toISOString(),
  };
}
