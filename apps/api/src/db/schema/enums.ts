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
  'processing',
  'ready',
  'failed',
  'infected',
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

export const actorTypeEnum = pgEnum('actor_type', ['user', 'recipient', 'admin', 'system']);

export const idempotencyStatusEnum = pgEnum('idempotency_status', ['in_progress', 'completed']);
