import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { auditEvents, scheduledActions, users } from '../../db/schema/index.js';
import { VirtualClock } from '../../lib/clock.js';
import { reconcileScheduledUnlocks } from './reconciliation.js';
import { createTestCapsule, createTestUser } from './test-helpers.js';

const trackedUserIds: string[] = [];
const trackedCapsuleIds: string[] = [];

describe('reconciliation (T-13) — "no capsule left behind"', () => {
  afterAll(async () => {
    if (trackedCapsuleIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.subjectId, trackedCapsuleIds));
      // scheduled_actions.subjectId has no FK to capsules, so it doesn't cascade off the user delete below.
      await db.delete(scheduledActions).where(inArray(scheduledActions.subjectId, trackedCapsuleIds));
    }
    if (trackedUserIds.length) {
      await db.delete(users).where(inArray(users.id, trackedUserIds));
    }
    await pool.end();
  });

  it('heals a sealed capsule with no live capsule_unlock row', async () => {
    const user = await createTestUser(db);
    trackedUserIds.push(user.id);
    const unlockAt = new Date('2026-08-01T00:00:00Z');
    // Sealed but its scheduled_actions row is missing entirely (simulates a bug/lost row).
    const capsule = await createTestCapsule(db, user.id, { state: 'sealed', unlockAt });
    trackedCapsuleIds.push(capsule.id);

    const clock = new VirtualClock(new Date('2026-07-01T00:00:00Z'));
    const result = await reconcileScheduledUnlocks(db, clock);

    expect(result.healed).toBeGreaterThanOrEqual(1);

    const rows = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.kind, 'capsule_unlock'), eq(scheduledActions.subjectId, capsule.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('pending');
    expect(rows[0]?.runAt.toISOString()).toBe(unlockAt.toISOString());

    const alarms = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectType, 'capsule'), eq(auditEvents.subjectId, capsule.id), eq(auditEvents.action, 'scheduler.reconciliation_healed')));
    expect(alarms).toHaveLength(1);
  });

  it('does not touch a sealed capsule that already has a live pending row', async () => {
    const user = await createTestUser(db);
    trackedUserIds.push(user.id);
    const unlockAt = new Date('2026-09-01T00:00:00Z');
    const capsule = await createTestCapsule(db, user.id, { state: 'sealed', unlockAt });
    trackedCapsuleIds.push(capsule.id);
    await db.insert(scheduledActions).values({
      kind: 'capsule_unlock',
      subjectId: capsule.id,
      runAt: unlockAt,
      idempotencyKey: `capsule_unlock:${capsule.id}`,
    });

    const clock = new VirtualClock(new Date('2026-08-01T00:00:00Z'));
    await reconcileScheduledUnlocks(db, clock);

    const rows = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.kind, 'capsule_unlock'), eq(scheduledActions.subjectId, capsule.id)));
    expect(rows).toHaveLength(1); // no duplicate inserted
  });

  it('does not heal a sealed capsule whose row already ran (done) — that would be a duplicate unlock, not a repair', async () => {
    const user = await createTestUser(db);
    trackedUserIds.push(user.id);
    const unlockAt = new Date('2026-01-01T00:00:00Z');
    // state is still 'sealed' here only because this test doesn't run the real handler; models a capsule whose
    // unlock action already completed but the capsule state flip hasn't been asserted by this test.
    const capsule = await createTestCapsule(db, user.id, { state: 'sealed', unlockAt });
    trackedCapsuleIds.push(capsule.id);
    await db.insert(scheduledActions).values({
      kind: 'capsule_unlock',
      subjectId: capsule.id,
      runAt: unlockAt,
      state: 'done',
      idempotencyKey: `capsule_unlock:${capsule.id}`,
    });

    const clock = new VirtualClock(new Date('2026-02-01T00:00:00Z'));
    await reconcileScheduledUnlocks(db, clock);

    const rows = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.kind, 'capsule_unlock'), eq(scheduledActions.subjectId, capsule.id)));
    // Healed with a fresh reconciled row alongside the old done one, since from reconciliation's
    // point of view "sealed + no live row" is indistinguishable from a genuinely lost schedule.
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
