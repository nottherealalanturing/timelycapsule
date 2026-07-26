import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { logger } from '../../logger.js';
import { capsules, scheduledActions } from '../../db/schema/index.js';

const HORIZON_MS = 60 * 24 * 60 * 60 * 1000;

interface UnlockLocal {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  tz: string; // IANA zone name
}

/**
 * Owners who pick a wall-clock local date+time (rather than an absolute
 * instant) get `unlockAt` computed once, at seal time, from the IANA tz
 * database as it exists *then*. Tz rules change (a country moves its DST
 * dates, abolishes DST, etc.) — over a 50-year horizon this can drift the
 * stored UTC instant away from what the owner actually meant ("6pm on my
 * birthday", not "this specific UTC second"). This nightly job re-derives
 * `runAt`/`unlockAt` from the stored local wall-clock fields for anything
 * due within the next 60 days, using the *current* tz rules.
 *
 * luxon's documented behavior for the two DST edge cases (verified
 * directly, not assumed): a nonexistent local time (spring-forward gap,
 * e.g. 2:30am on a "spring forward at 2am" day) is shifted forward by the
 * gap width; an ambiguous local time (fall-back, e.g. 1:30am occurring
 * twice) resolves to the first (pre-fallback) occurrence. Both keep
 * `isValid: true` — there's no "reject" case to guard here.
 */
export async function reresolveWallClockActions(db: Database, clock: Clock): Promise<number> {
  const now = clock.now();
  const horizon = new Date(now.getTime() + HORIZON_MS);

  const rows = await db
    .select({
      actionId: scheduledActions.id,
      capsuleId: capsules.id,
      unlockLocal: capsules.unlockLocal,
      currentRunAt: scheduledActions.runAt,
    })
    .from(scheduledActions)
    .innerJoin(capsules, eq(capsules.id, scheduledActions.subjectId))
    .where(
      and(
        eq(scheduledActions.kind, 'capsule_unlock'),
        eq(scheduledActions.state, 'pending'),
        lte(scheduledActions.runAt, horizon),
        isNotNull(capsules.unlockLocal),
      ),
    );

  let updated = 0;
  for (const row of rows) {
    const local = row.unlockLocal as UnlockLocal | null;
    if (!local?.date || !local.time || !local.tz) continue;

    const resolved = DateTime.fromISO(`${local.date}T${local.time}`, { zone: local.tz });
    if (!resolved.isValid) continue;

    const newRunAt = resolved.toJSDate();
    if (newRunAt.getTime() === row.currentRunAt.getTime()) continue;

    await db.update(scheduledActions).set({ runAt: newRunAt }).where(eq(scheduledActions.id, row.actionId));
    await db.update(capsules).set({ unlockAt: newRunAt }).where(eq(capsules.id, row.capsuleId));
    updated += 1;
  }

  if (updated > 0) {
    logger.info({ event: 'scheduler_reresolved', count: updated }, 'Re-resolved wall-clock scheduled actions');
  }
  return updated;
}
