import type { MarkNotificationsReadRequest, Notification, NotificationCategory, NotificationPrefs, PushToken, RegisterPushTokenRequest } from '@tc/contracts';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { buildPage, decodeCursor, type PageResult } from '../../lib/pagination.js';
import { notificationPrefs, notifications, pushTokens } from '../../db/schema/index.js';

const DEFAULT_PREFS: NotificationPrefs = { quietHours: null, emailOptOut: [] };

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotifications(
  db: Database,
  userId: string,
  query: { cursor?: string; limit: number },
): Promise<PageResult<Notification>> {
  const conditions = [eq(notifications.userId, userId)];
  if (query.cursor) conditions.push(lt(notifications.createdAt, new Date(decodeCursor(query.cursor))));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(query.limit + 1);

  const page = buildPage(rows, query.limit, (row) => row.createdAt.toISOString());
  return { data: page.data.map(toNotification), nextCursor: page.nextCursor };
}

/** Omitting `ids` marks every unread notification for this user read. */
export async function markNotificationsRead(db: Database, userId: string, input: MarkNotificationsReadRequest): Promise<void> {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (input.ids?.length) conditions.push(inArray(notifications.id, input.ids));

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

export async function getNotificationPrefs(db: Database, userId: string): Promise<NotificationPrefs> {
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1);
  if (!row) return DEFAULT_PREFS;
  return { ...DEFAULT_PREFS, ...(row.prefs as Partial<NotificationPrefs>) };
}

export async function putNotificationPrefs(db: Database, userId: string, prefs: NotificationPrefs): Promise<NotificationPrefs> {
  await db
    .insert(notificationPrefs)
    .values({ userId, prefs, updatedAt: new Date() })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: { prefs, updatedAt: new Date() } });
  return prefs;
}

/**
 * Quiet-hours check for a given local wall-clock "HH:mm" (caller resolves
 * the user's own timezone before calling — this function is pure clock
 * math, not tz-aware). Handles the overnight-wrap case (e.g. 22:00–08:00).
 */
export function isWithinQuietHours(prefs: NotificationPrefs, nowHHmm: string): boolean {
  if (!prefs.quietHours) return false;
  const { start, end } = prefs.quietHours;
  if (start === end) return false;
  if (start < end) return nowHHmm >= start && nowHHmm < end;
  return nowHHmm >= start || nowHHmm < end; // wraps past midnight
}

/**
 * Writes the in-app notification row. In-app is always written regardless
 * of `emailOptOut` — that pref only governs the email channel (03-ARCHITECTURE.md
 * §11's matrix treats push/email/in-app as independent columns).
 */
export async function writeNotification(
  db: Database,
  input: { userId: string; category: NotificationCategory; title: string; body?: string; data?: unknown },
): Promise<void> {
  await db.insert(notifications).values({
    userId: input.userId,
    category: input.category,
    title: input.title,
    body: input.body,
    data: input.data,
  });
}

/** `security` emails are always sent regardless of prefs (03-ARCHITECTURE.md §11: "non-optional"). */
export function shouldSendEmail(prefs: NotificationPrefs, category: NotificationCategory): boolean {
  if (category === 'security') return true;
  return !prefs.emailOptOut.includes(category);
}

function toPushToken(row: typeof pushTokens.$inferSelect): PushToken {
  return {
    id: row.id,
    platform: row.platform,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Upserts on `token` (unique) rather than inserting unconditionally: the
 * same device token re-registering (app relaunch, or a different account
 * logging in on the same device) must move to the new `userId`/`platform`
 * rather than violate the unique constraint or leave a stale row pointing
 * at the wrong account. Re-registering also clears `invalidAt` — a token
 * the push provider previously reported as dead is live again once the
 * device demonstrably re-registers it.
 */
export async function registerPushToken(db: Database, userId: string, input: RegisterPushTokenRequest): Promise<PushToken> {
  const [row] = await db
    .insert(pushTokens)
    .values({ userId, token: input.token, platform: input.platform, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, platform: input.platform, lastSeenAt: new Date(), invalidAt: null },
    })
    .returning();
  return toPushToken(row!);
}

export async function unregisterPushToken(db: Database, userId: string, id: string): Promise<void> {
  const [row] = await db
    .select({ id: pushTokens.id })
    .from(pushTokens)
    .where(and(eq(pushTokens.id, id), eq(pushTokens.userId, userId)))
    .limit(1);
  if (!row) throw ApiError.notFound('Push token not found');
  await db.delete(pushTokens).where(eq(pushTokens.id, id));
}
