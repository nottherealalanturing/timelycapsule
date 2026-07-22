import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, inet } from './custom-types';
import { oauthProviderEnum, platformEnum, userStatusEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  passwordHash: text('password_hash'), // null for oauth-only accounts
  displayName: text('display_name').notNull(),
  handle: citext('handle'), // nullable until public features are used
  avatarKey: text('avatar_key'),
  birthday: date('birthday'),
  timezone: text('timezone').notNull().default('UTC'), // IANA tz name
  locale: text('locale').notNull().default('en'),
  status: userStatusEnum('status').notNull().default('unverified'),
  ghostClaimedAt: timestamp('ghost_claimed_at', { withTimezone: true }),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: boolean('totp_enabled').default(false),
  quietHours: jsonb('quiet_hours'), // {start:"22:00", end:"08:00"}
  marketingOptIn: boolean('marketing_opt_in').default(false),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }), // legacy inactivity checks
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_unique').on(t.email),
  uniqueIndex('users_handle_unique').on(t.handle),
]);

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: oauthProviderEnum('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('oauth_accounts_provider_unique').on(t.provider, t.providerUserId),
  index('oauth_accounts_user_id_idx').on(t.userId),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  deviceName: text('device_name'),
  platform: platformEnum('platform').notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sessions_refresh_token_hash_unique').on(t.refreshTokenHash),
  index('sessions_user_id_idx').on(t.userId),
]);

export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('recovery_codes_user_id_idx').on(t.userId)]);

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  platform: platformEnum('platform').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  invalidAt: timestamp('invalid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('push_tokens_token_unique').on(t.token),
  index('push_tokens_user_id_idx').on(t.userId),
]);
