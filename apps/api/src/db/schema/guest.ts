import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { inet } from './custom-types';
import { users } from './identity';

/**
 * Anonymous try-before-signup sessions (01-PRODUCT.md §4.1b). `tokenHash`
 * is the only credential — the raw token is returned once at creation and
 * persisted client-side (localStorage), matching T-09's recipient-token
 * one-time-reveal pattern. Burned (claimedAt set) the moment its capsule(s)
 * are claimed into a real account.
 */
export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('guest_sessions_token_hash_unique').on(t.tokenHash), index('guest_sessions_ip_idx').on(t.ip)],
);
