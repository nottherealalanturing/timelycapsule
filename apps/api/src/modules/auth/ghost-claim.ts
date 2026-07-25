import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { capsuleRecipients, users } from '../../db/schema/index.js';

/**
 * Ghost-claim (plan/05-BUILD-PLAYBOOK.md T-05): whenever a user's email
 * becomes verified — password signup completing /auth/verify-email, or any
 * Google OAuth signup/link, both of which only reach here with a trusted
 * verified email — attach any `capsule_recipients` rows that were added by
 * email before this person ever had an account. Only unclaimed rows
 * (`userId IS NULL`) are touched, so this is safe to call repeatedly.
 */
export async function claimGhostRecipients(db: Database, userId: string, email: string): Promise<number> {
  const claimed = await db
    .update(capsuleRecipients)
    .set({ userId })
    .where(and(eq(capsuleRecipients.email, email), isNull(capsuleRecipients.userId)))
    .returning({ id: capsuleRecipients.id });

  if (claimed.length > 0) {
    await db
      .update(users)
      .set({ ghostClaimedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.ghostClaimedAt)));
  }

  return claimed.length;
}
