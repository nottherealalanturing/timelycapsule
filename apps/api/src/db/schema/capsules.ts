import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from './custom-types';
import { users } from './identity';
import {
  breakGlassEnum,
  capsuleStateEnum,
  capsuleTypeEnum,
  mediaKindEnum,
  mediaStatusEnum,
  recipientStatusEnum,
  unlockModeEnum,
} from './enums';

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

const pgInterval = customType<{ data: string }>({
  dataType() {
    return 'interval';
  },
});

export const capsules = pgTable(
  'capsules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: text('public_id').notNull(), // 8-char human-readable handle (06 §D)
    seals: jsonb('seals').notNull().default([]), // unlock conditions beyond time (06 §B)
    expiresAfter: pgInterval('expires_after'),
    expiryStrict: boolean('expiry_strict').default(false),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id'), // orgs table not yet created (Phase 3, T-42) — FK added then
    type: capsuleTypeEnum('type').notNull(),
    state: capsuleStateEnum('state').notNull().default('draft'),
    title: text('title'),
    cover: jsonb('cover'), // {kind:"gradient"|"image", value, theme}
    teaser: text('teaser'),
    contentDocEnc: bytea('content_doc_enc'), // E2E ciphertext (06 §A) — never plaintext
    ownerKeyWrap: bytea('owner_key_wrap'),
    passphraseHint: text('passphrase_hint'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
    unlockMode: unlockModeEnum('unlock_mode').notNull().default('absolute'),
    unlockAt: timestamp('unlock_at', { withTimezone: true }),
    unlockLocal: jsonb('unlock_local'), // {date, time, tz}
    sealDeadlineAt: timestamp('seal_deadline_at', { withTimezone: true }),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    extendedOnce: boolean('extended_once').default(false),
    recurrence: jsonb('recurrence'), // {freq:"yearly", count|until}
    seriesId: uuid('series_id'),
    chainParentId: uuid('chain_parent_id').references((): AnyPgColumn => capsules.id),
    chainDelay: pgInterval('chain_delay'),
    allowDownload: boolean('allow_download').default(true),
    recipientsVisible: boolean('recipients_visible').default(false),
    announceOnSeal: boolean('announce_on_seal').default(true),
    breakGlass: breakGlassEnum('break_glass').default('disabled'),
    breakGlassRequestedAt: timestamp('break_glass_requested_at', { withTimezone: true }),
    requireRecipientVerification: boolean('require_recipient_verification').default(false),
    replyPrompt: text('reply_prompt'),
    location: jsonb('location'), // {lat, lng, name}
    sealedDaySnapshot: jsonb('sealed_day_snapshot'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    legacyConfig: jsonb('legacy_config'), // {trigger:"date"|"trustee"|"first_of"|"last_of"}
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('capsules_public_id_unique').on(t.publicId),
    index('capsules_owner_state_idx').on(t.ownerId, t.state),
    index('capsules_state_unlock_at_idx').on(t.state, t.unlockAt), // the scheduler's hot index
    index('capsules_org_id_idx').on(t.orgId),
    index('capsules_series_id_idx').on(t.seriesId),
    index('capsules_trashed_at_idx').on(t.trashedAt).where(sql`${t.trashedAt} IS NOT NULL`),
  ],
);

/**
 * Draft snapshot history (T-08 ticket text: "Capsule versions (draft
 * snapshots, keep 20)"). One row written per PATCH to a draft, holding the
 * *pre-patch* state so a user can step back through edit history; trimmed
 * to the last 20 per capsule on every insert (see modules/capsules/versions.ts).
 * Snapshots stop once a capsule seals — sealed content is immutable, so
 * there is nothing further to version.
 */
export const capsuleVersions = pgTable(
  'capsule_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('capsule_versions_capsule_id_created_at_idx').on(t.capsuleId, t.createdAt)],
);

export const capsuleRecipients = pgTable(
  'capsule_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: citext('email'),
    phone: text('phone'),
    displayName: text('display_name'),
    accessTokenHash: text('access_token_hash').notNull(),
    status: recipientStatusEnum('status').notNull().default('added'),
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    tzInferred: text('tz_inferred'),
    resolvedUnlockAt: timestamp('resolved_unlock_at', { withTimezone: true }),
    verificationRequired: boolean('verification_required'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    isFallback: boolean('is_fallback').default(false),
    fallbackAfter: pgInterval('fallback_after'),
    reminderOptIn: jsonb('reminder_opt_in'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('capsule_recipients_capsule_email_unique').on(t.capsuleId, t.email),
    uniqueIndex('capsule_recipients_capsule_user_unique').on(t.capsuleId, t.userId),
    uniqueIndex('capsule_recipients_access_token_hash_unique').on(t.accessTokenHash),
    index('capsule_recipients_capsule_id_idx').on(t.capsuleId),
  ],
);

export const mediaItems = pgTable(
  'media_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id),
    kind: mediaKindEnum('kind').notNull(),
    storageKey: text('storage_key'),
    originalName: text('original_name'),
    mime: text('mime'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    caption: text('caption'),
    position: integer('position').notNull(),
    blurhash: text('blurhash'),
    thumbKey: text('thumb_key'),
    previewKey: text('preview_key'),
    hlsKey: text('hls_key'),
    encMeta: jsonb('enc_meta'), // E2E per-file IVs/chunking info (06 §A)
    status: mediaStatusEnum('status').default('uploading'),
    scanResult: jsonb('scan_result'),
    exifCapturedAt: timestamp('exif_captured_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_items_capsule_id_idx').on(t.capsuleId)],
);

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capsuleId: uuid('capsule_id')
      .notNull()
      .references(() => capsules.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => capsuleRecipients.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reactions_capsule_id_idx').on(t.capsuleId)],
);

/**
 * Identity Seal OTP codes (T-15, plan/06-FEATURE-ADDENDUM.md §B) — a
 * dedicated table rather than reusing `email_otp_codes`, since that one is
 * scoped to an authenticated `userId` and recipients have no account.
 */
export const recipientOtpCodes = pgTable(
  'recipient_otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => capsuleRecipients.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recipient_otp_codes_recipient_id_idx').on(t.recipientId)],
);
