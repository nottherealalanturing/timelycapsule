import type { Notification } from '@tc/contracts';

/**
 * The one normalized shape the Notifications screen renders. `Notification`
 * itself already carries a fully-formed, human-readable `title` composed
 * server-side for every event that currently produces a row (recipient
 * opened a capsule, a reply arrived, a media-release warning, an email
 * bounce — see apps/api/src/modules/{reveal,replies}/service.ts,
 * modules/scheduler/handlers/media-release-warning.ts, modules/email/
 * webhook.ts's `writeNotification()` calls) — there is no separate
 * client-side "event type" to switch on, and no per-category rendering is
 * invented here beyond what the API actually sends. `category`
 * (`unlock|reminder|delivery|social|security|billing|product|digest`) is a
 * coarser bucket than those four events and is not used for display at
 * all, which is also what makes this model automatically safe for any
 * future category or event type: there is nothing here that only knows
 * how to render four specific things.
 *
 * `data` is `z.unknown().nullable()` — genuinely not schema-enforced (see
 * packages/contracts/src/notifications.ts's own comment lineage and the
 * E1.3 final readiness audit's finding that `data.capsuleId` is
 * conventional, not guaranteed). `capsuleId` below is `null` whenever
 * `data` isn't shaped the way every current writer happens to shape it,
 * or the value isn't a real-looking UUID — never `undefined`, never a
 * blind cast — so a screen can treat "no `capsuleId`" as the single,
 * simple signal for "this row doesn't navigate."
 */
export interface NotificationRowItem {
  id: string;
  title: string;
  body: string | null;
  dateLabel: string;
  unread: boolean;
  capsuleId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractCapsuleId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = (data as Record<string, unknown>).capsuleId;
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fromNotification(notification: Notification): NotificationRowItem {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    dateLabel: formatDate(notification.createdAt),
    unread: notification.readAt === null,
    capsuleId: extractCapsuleId(notification.data),
  };
}
