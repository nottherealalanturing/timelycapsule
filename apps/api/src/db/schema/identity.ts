import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, inet } from './custom-types';
import { oauthProviderEnum, otpPurposeEnum, platformEnum, userStatusEnum } from './enums';

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

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
  // Zero-access E2E (06 §A / 03 §8): the owner master key never reaches the
  // server unwrapped. masterKeyWrap is that key encrypted under
  // Argon2id(password) client-side (@tc/crypto's master-key.ts), re-wrapped
  // on password change; recoveryKeyWrap is the same key wrapped under a
  // printable recovery code instead, so a lost password isn't fully fatal.
  // Both null for accounts created before this column existed and for
  // OAuth-only accounts with no password to derive a wrap key from (T-11
  // decisions log: composer prompts those users to set a password first).
  masterKeyWrap: bytea('master_key_wrap'),
  recoveryKeyWrap: bytea('recovery_key_wrap'),
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
  // Holds the immediately-prior token's hash for one rotation only, so a
  // replayed (already-rotated-out) refresh token can be detected as reuse
  // and the whole session ("family") revoked — see modules/auth/tokens.ts.
  previousRefreshTokenHash: text('previous_refresh_token_hash'),
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

/**
 * Email OTP codes: verify-email (short numeric code, scoped to a known
 * userId — the user is already authenticated via the tokens returned from
 * signup) and password-reset (opaque random token, looked up by hash alone
 * since the requester isn't authenticated yet). Delivery is console-only
 * until T-07's email infrastructure lands (see modules/auth/otp.ts).
 */
export const emailOtpCodes = pgTable('email_otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: otpPurposeEnum('purpose').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('email_otp_codes_user_id_purpose_idx').on(t.userId, t.purpose),
  index('email_otp_codes_code_hash_idx').on(t.codeHash),
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
