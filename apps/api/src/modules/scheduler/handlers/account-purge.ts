import { and, eq } from 'drizzle-orm';
import { audit } from '../../../db/audit.js';
import { capsules, users } from '../../../db/schema/index.js';
import type { ActionHandler } from './dispatch.js';

/**
 * F8's 30-day pending-deletion purge (02-UX-DESIGN.md §7). No-ops if the
 * user already logged back in and had the deletion cancelled (status back
 * to `active`) — cancellation clears `status` back before this ever fires,
 * same "check it's still due" guard every other scheduled handler uses.
 */
export const accountPurgeHandler: ActionHandler = async ({ db, subjectId: userId }) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return; // already gone (e.g. redelivered job)
  if (user.status !== 'pending_deletion') return; // cancelled since scheduling

  // "Deliver as scheduled" capsules: sender identity is anonymized
  // (ownerId → null, same fallback the reveal pipeline already uses for
  // guest capsules — "From Someone") but the content and the recipient's
  // own capsule-key copy are untouched, so delivery still happens exactly
  // as promised. Everything else still owned by this user (drafts,
  // self-only capsules, capsules nobody else has a stake in, or ones
  // already withdrawn immediately at request time) cascades away with the
  // user row itself below.
  await db
    .update(capsules)
    .set({ ownerId: null, deletionDecision: null })
    .where(and(eq(capsules.ownerId, userId), eq(capsules.deletionDecision, 'deliver')));

  await db.delete(users).where(eq(users.id, userId));
  await audit(db, { actorType: 'system', action: 'account.purged', subjectType: 'user', subjectId: userId });
};
