import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { capsuleRecipients } from './capsules';
import { notifCategoryEnum, outboundChannelEnum, outboundStateEnum } from './enums';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').references(() => capsuleRecipients.id, {
      onDelete: 'cascade',
    }),
    category: notifCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_id_idx').on(t.userId),
    index('notifications_recipient_id_idx').on(t.recipientId),
  ],
);

export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').notNull().default({}), // {unlock:{push,email,sms}, ...}
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Audit + retry ledger for every external send (plan/03-ARCHITECTURE.md §11). */
export const outboundMessages = pgTable(
  'outbound_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: outboundChannelEnum('channel').notNull(),
    toRef: text('to_ref').notNull(), // email address / phone / push token
    template: text('template').notNull(),
    payload: jsonb('payload'),
    state: outboundStateEnum('state').notNull().default('queued'),
    providerId: text('provider_id'),
    attempts: integer('attempts').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('outbound_messages_state_idx').on(t.state),
    index('outbound_messages_to_ref_idx').on(t.toRef),
  ],
);
