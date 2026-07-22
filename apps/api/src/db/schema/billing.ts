import { bigint, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { entitlementPlanEnum, entitlementSourceEnum } from './enums';

export const entitlements = pgTable('entitlements', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan: entitlementPlanEnum('plan').notNull().default('free'),
  source: entitlementSourceEnum('source'),
  storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' }).notNull(),
  seats: integer('seats'),
  familyOwnerId: uuid('family_owner_id').references(() => users.id, { onDelete: 'set null' }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  graceUntil: timestamp('grace_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
