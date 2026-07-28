import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { capsules, guestSessions } from '../../db/schema/index.js';
import { hashGuestToken } from './token.js';

/**
 * Guest claim (T-15b) — mirrors auth/ghost-claim.ts's shape but keyed on
 * the guest token rather than a verified email: possessing the raw token
 * (something only the guest's own browser ever held) is itself the proof
 * of authorship, so this runs directly from signup/OAuth regardless of
 * email-verification state (unlike ghost-claim, which waits for a trusted
 * verified email). Transfers every capsule created under the session to
 * the new user and burns the session. Safe to call with an invalid/already
 * -claimed token — silently no-ops rather than failing the signup.
 */
export async function claimGuestSession(db: Database, userId: string, rawGuestToken: string | undefined): Promise<number> {
  if (!rawGuestToken) return 0;

  const [session] = await db.select().from(guestSessions).where(eq(guestSessions.tokenHash, hashGuestToken(rawGuestToken))).limit(1);
  if (!session || session.claimedAt) return 0;

  const claimed = await db.update(capsules).set({ ownerId: userId }).where(eq(capsules.guestSessionId, session.id)).returning({ id: capsules.id });

  await db.update(guestSessions).set({ claimedByUserId: userId, claimedAt: new Date() }).where(eq(guestSessions.id, session.id));

  return claimed.length;
}
