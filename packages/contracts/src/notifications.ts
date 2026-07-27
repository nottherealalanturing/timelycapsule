import { z } from 'zod';
import { paginatedResponse } from './common';

/** In-app notifications + prefs, T-14 — plan/03-ARCHITECTURE.md §11. */

export const NotificationCategorySchema = z.enum([
  'unlock',
  'reminder',
  'delivery',
  'social',
  'security',
  'billing',
  'product',
  'digest',
]);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  category: NotificationCategorySchema,
  title: z.string(),
  body: z.string().nullable(),
  data: z.unknown().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationsListResponseSchema = paginatedResponse(NotificationSchema);
export type NotificationsListResponse = z.infer<typeof NotificationsListResponseSchema>;

/** Omit `ids` to mark every unread notification read. */
export const MarkNotificationsReadRequestSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});
export type MarkNotificationsReadRequest = z.infer<typeof MarkNotificationsReadRequestSchema>;

/**
 * `security` can never be opted out of by email (03-ARCHITECTURE.md §11:
 * "Security ... Email always (non-optional)") — enforced at send time in
 * modules/notifications, not just here, but the schema still rejects it
 * outright so a client can't even construct a request that implies otherwise.
 */
export const NotificationPrefsSchema = z.object({
  quietHours: z
    .object({
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), // "HH:mm"
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .nullable(),
  emailOptOut: z.array(NotificationCategorySchema.exclude(['security'])),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

export const NotificationPrefsResponseSchema = z.object({ prefs: NotificationPrefsSchema });
export type NotificationPrefsResponse = z.infer<typeof NotificationPrefsResponseSchema>;

/** Client-constructed recipient magic link, relayed for the server to drop unparsed into an email (T-14 decisions log — the server never holds the capsule key). */
export const SendAnnounceRequestSchema = z.object({
  link: z.string().url(),
});
export type SendAnnounceRequest = z.infer<typeof SendAnnounceRequestSchema>;
