import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * All PG enums per plan/03-ARCHITECTURE.md §13. Keep member lists in sync
 * with the doc — adding a state here without updating the doc (or vice
 * versa) is exactly the drift plan/00-INDEX.md warns against.
 */

export const userStatusEnum = pgEnum('user_status', [
  'unverified',
  'active',
  'suspended',
  'pending_deletion',
  'deleted',
  'ghost',
]);

export const oauthProviderEnum = pgEnum('oauth_provider', ['apple', 'google']);

export const platformEnum = pgEnum('platform', ['web', 'ios', 'android']);

export const capsuleTypeEnum = pgEnum('capsule_type', [
  'self',
  'personal',
  'group',
  'birthday',
  'anniversary',
  'public',
  'legacy',
  'emergency',
  'campaign',
  'micro',
]);

export const capsuleStateEnum = pgEnum('capsule_state', [
  'draft',
  'sealing',
  'sealed',
  'unlocked',
  'expired',
  'withdrawn',
]);

export const unlockModeEnum = pgEnum('unlock_mode', [
  'absolute',
  'recipient_local',
  'trustee',
  'chained',
]);

export const breakGlassEnum = pgEnum('break_glass', ['disabled', 'allowed']);

export const recipientStatusEnum = pgEnum('recipient_status', [
  'added',
  'invited',
  'notified',
  'viewed_locked',
  'opened',
  'bounced',
  'blocked_suppressed',
]);

export const mediaKindEnum = pgEnum('media_kind', [
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'archive',
  'link',
  'location',
]);

export const mediaStatusEnum = pgEnum('media_status', [
  'uploading',
  // @deprecated Never written by any code path and never read. Retained
  // rather than removed: dropping a member from a PG enum means recreating
  // the type and rewriting every dependent column, for no functional gain,
  // and any stale client holding the old contract would fail to parse.
  'processing',
  'ready',
  'failed',
  'infected',
  // M4. The encrypted bytes have been reclaimed from object storage; the row
  // survives as the historical record of what was enclosed. Terminal — a
  // released item never returns to 'ready'.
  'released',
]);

export const actionKindEnum = pgEnum('action_kind', [
  'capsule_unlock',
  'recipient_unlock',
  'reminder',
  'checkin',
  'breakglass_open',
  'trash_purge',
  'trigger_release',
  'chain_unlock',
  'series_spawn',
  'announce',
  'capsule_expire',
  'expire_purge',
  'data_export',
  'account_purge',
  // M4 storage lifecycle. Two kinds rather than one: both carry
  // subjectId=capsuleId, so the `reminder` handler's trick of probing two
  // disjoint UUID spaces to tell owner from recipient is unavailable here,
  // and a single kind would be genuinely ambiguous at dispatch.
  'media_release_warning',
  'media_release',
]);

export const actionStateEnum = pgEnum('action_state', [
  'pending',
  'enqueued',
  'done',
  'failed',
  'cancelled',
]);

export const notifCategoryEnum = pgEnum('notif_category', [
  'unlock',
  'reminder',
  'delivery',
  'social',
  'security',
  'billing',
  'product',
  'digest',
]);

export const outboundChannelEnum = pgEnum('outbound_channel', ['email', 'sms', 'push']);

export const outboundStateEnum = pgEnum('outbound_state', [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'failed',
]);

export const entitlementPlanEnum = pgEnum('entitlement_plan', [
  'free',
  'premium',
  'family',
  'business',
  'enterprise',
]);

export const entitlementSourceEnum = pgEnum('entitlement_source', [
  'stripe',
  'apple',
  'google',
  'gift',
  'comp',
]);

export const actorTypeEnum = pgEnum('actor_type', ['user', 'recipient', 'admin', 'system', 'guest']);

export const idempotencyStatusEnum = pgEnum('idempotency_status', ['in_progress', 'completed']);

export const otpPurposeEnum = pgEnum('otp_purpose', ['verify_email', 'password_reset', 'change_email']);

/** Owner's choice for a sealed capsule with real (non-suppressed) recipients when they request account deletion (F8) — 02-UX-DESIGN.md §7. */
export const deletionDecisionEnum = pgEnum('deletion_decision', ['deliver', 'withdraw']);

/**
 * Which side of a capsule wrote a reply.
 *
 * Not `actor_type`: that one is an audit vocabulary of five kinds and admits a
 * `system` and an `admin`, neither of which can ever author a reply — nothing
 * but the two people on either end of a capsule may write into it.
 */
export const replyAuthorEnum = pgEnum('reply_author', ['sender', 'recipient']);
