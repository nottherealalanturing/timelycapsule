import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { citext } from './custom-types';
import { users } from './identity';
import { capsules } from './capsules';

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: citext('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_user_id_name_unique').on(t.userId, t.name)],
);

export const capsuleTags = pgTable(
  'capsule_tags',
  {
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.capsuleId, t.tagId] }),
    index('capsule_tags_tag_id_idx').on(t.tagId),
  ],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.capsuleId] })],
);

/**
 * A user silently blocking future capsules from a given sender email
 * (plan/03-ARCHITECTURE.md §13/§17 threat #5). Checked on recipient
 * creation (modules/recipients) — a blocked add still reports success to
 * the sender ("masked success") but the recipient row is created already
 * `blocked_suppressed`, so nothing is ever actually delivered.
 */
export const blocks = pgTable(
  'blocks',
  {
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedEmail: citext('blocked_email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerUserId, t.blockedEmail] })],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: citext('email'),
    phone: text('phone'),
    birthday: date('birthday'),
    linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contacts_owner_id_idx').on(t.ownerId)],
);

export const contactGroups = pgTable(
  'contact_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('contact_groups_owner_id_name_unique').on(t.ownerId, t.name)],
);

export const contactGroupMembers = pgTable(
  'contact_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => contactGroups.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.contactId] }), index('contact_group_members_contact_id_idx').on(t.contactId)],
);

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cover: jsonb('cover'), // {kind:"gradient"|"image", value, theme} — same shape as capsules.cover
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('collections_user_id_position_idx').on(t.userId, t.position)],
);

export const collectionItems = pgTable(
  'collection_items',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.capsuleId] }),
    index('collection_items_capsule_id_idx').on(t.capsuleId),
  ],
);
