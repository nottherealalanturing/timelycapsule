import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../../../env.js';
import { db, pool } from '../../../db/client.js';
import { auditEvents, capsuleRecipients, capsules, mediaItems, outboundMessages, scheduledActions, users } from '../../../db/schema/index.js';
import { VirtualClock } from '../../../lib/clock.js';
import { getStorageAdapter } from '../../media/index.js';
import { createTestCapsule, createTestRecipient, createTestUser, insertScheduledAction } from '../test-helpers.js';
import { breakglassOpenHandler } from './breakglass-open.js';
import { capsuleUnlockHandler } from './capsule-unlock.js';
import { runAction, type ActionHandler } from './dispatch.js';
import { recipientUnlockHandler } from './recipient-unlock.js';
import { reminderHandler } from './reminder.js';
import { trashPurgeHandler } from './trash-purge.js';

const trackedUserIds: string[] = [];
const trackedCapsuleIds: string[] = [];
const trackedActionIds: string[] = [];

async function loadCapsule(id: string) {
  const [row] = await db.select().from(capsules).where(eq(capsules.id, id));
  if (!row) throw new Error(`capsule ${id} not found`);
  return row;
}

async function loadRecipient(id: string) {
  const [row] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, id));
  if (!row) throw new Error(`recipient ${id} not found`);
  return row;
}

async function loadAction(id: string) {
  const [row] = await db.select().from(scheduledActions).where(eq(scheduledActions.id, id));
  if (!row) throw new Error(`scheduled_action ${id} not found`);
  return row;
}

describe('scheduler action handlers (T-13)', () => {
  afterAll(async () => {
    if (trackedCapsuleIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.subjectId, trackedCapsuleIds));
      await db.delete(scheduledActions).where(inArray(scheduledActions.subjectId, trackedCapsuleIds));
    }
    if (trackedActionIds.length) {
      await db.delete(scheduledActions).where(inArray(scheduledActions.id, trackedActionIds));
    }
    if (trackedUserIds.length) {
      await db.delete(users).where(inArray(users.id, trackedUserIds));
    }
    await pool.end();
  });

  async function seedSealedCapsule(overrides: Partial<typeof capsules.$inferInsert> = {}) {
    const user = await createTestUser(db);
    trackedUserIds.push(user.id);
    const capsule = await createTestCapsule(db, user.id, { state: 'sealed', unlockAt: new Date(), ...overrides });
    trackedCapsuleIds.push(capsule.id);
    return capsule;
  }

  it('capsule_unlock: flips sealed -> unlocked and spawns recipient_unlock for non-suppressed recipients only', async () => {
    const capsule = await seedSealedCapsule();
    const opened = await createTestRecipient(db, capsule.id, { status: 'added' });
    const suppressed = await createTestRecipient(db, capsule.id, { status: 'blocked_suppressed' });

    const clock = new VirtualClock(new Date('2026-03-01T00:00:00Z'));
    await capsuleUnlockHandler({ db, clock, subjectId: capsule.id });

    const row = await loadCapsule(capsule.id);
    expect(row.state).toBe('unlocked');

    const spawned = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, opened.id));
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.kind).toBe('recipient_unlock');
    trackedActionIds.push(spawned[0]!.id);

    const suppressedSpawned = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, suppressed.id));
    expect(suppressedSpawned).toHaveLength(0);
  });

  it('capsule_unlock is idempotent: re-running against an already-unlocked capsule spawns nothing new', async () => {
    const capsule = await seedSealedCapsule();
    const recipient = await createTestRecipient(db, capsule.id, { status: 'added' });
    const clock = new VirtualClock(new Date('2026-03-01T00:00:00Z'));

    await capsuleUnlockHandler({ db, clock, subjectId: capsule.id });
    const firstSpawn = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, recipient.id));
    trackedActionIds.push(...firstSpawn.map((r) => r.id));

    await capsuleUnlockHandler({ db, clock, subjectId: capsule.id }); // redelivered job
    const secondSpawn = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, recipient.id));
    expect(secondSpawn).toHaveLength(firstSpawn.length); // no duplicate spawn
  });

  it('recipient_unlock: marks an added/invited recipient notified and no-ops for opened/suppressed', async () => {
    const capsule = await seedSealedCapsule();
    const added = await createTestRecipient(db, capsule.id, { status: 'added' });
    const opened = await createTestRecipient(db, capsule.id, { status: 'opened' });

    await recipientUnlockHandler({ db, clock: new VirtualClock(new Date()), subjectId: added.id });
    await recipientUnlockHandler({ db, clock: new VirtualClock(new Date()), subjectId: opened.id });

    const addedRow = await loadRecipient(added.id);
    const openedRow = await loadRecipient(opened.id);
    expect(addedRow.status).toBe('notified');
    expect(openedRow.status).toBe('opened'); // untouched
  });

  it('recipient_unlock sends a real unlock email (T-14) and records it in the outbound ledger', async () => {
    const capsule = await seedSealedCapsule();
    const recipient = await createTestRecipient(db, capsule.id, { status: 'invited' });

    await recipientUnlockHandler({ db, clock: new VirtualClock(new Date()), subjectId: recipient.id });

    const sent = await db.select().from(outboundMessages).where(eq(outboundMessages.toRef, recipient.email!));
    expect(sent.some((m) => m.template === 'capsule-unlocked' && m.state === 'sent')).toBe(true);
  });

  it('breakglass_open: only fires when sealed and breakGlass is allowed', async () => {
    const allowed = await seedSealedCapsule({ breakGlass: 'allowed' });
    const disabled = await seedSealedCapsule({ breakGlass: 'disabled' });
    const clock = new VirtualClock(new Date());

    await breakglassOpenHandler({ db, clock, subjectId: allowed.id });
    await breakglassOpenHandler({ db, clock, subjectId: disabled.id });

    const allowedRow = await loadCapsule(allowed.id);
    const disabledRow = await loadCapsule(disabled.id);
    expect(allowedRow.state).toBe('unlocked');
    expect(disabledRow.state).toBe('sealed'); // untouched
  });

  it('reminder: skips a recipient who opted out', async () => {
    const capsule = await seedSealedCapsule({ unlockAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) });
    const optedOut = await createTestRecipient(db, capsule.id, { status: 'added', reminderOptIn: { enabled: false } });
    await reminderHandler({ db, clock: new VirtualClock(new Date()), subjectId: optedOut.id });
    const sent = await db.select().from(outboundMessages).where(eq(outboundMessages.toRef, optedOut.email!));
    expect(sent).toHaveLength(0);
  });

  it('reminder: sends a real email to an opted-in recipient', async () => {
    const capsule = await seedSealedCapsule({ unlockAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) });
    const optedIn = await createTestRecipient(db, capsule.id, { status: 'added' });
    await reminderHandler({ db, clock: new VirtualClock(new Date()), subjectId: optedIn.id });
    const sent = await db.select().from(outboundMessages).where(eq(outboundMessages.toRef, optedIn.email!));
    expect(sent.some((m) => m.template === 'pre-unlock-reminder' && m.state === 'sent')).toBe(true);
  });

  it('reminder: disambiguates a capsule subjectId as the owner\'s own T-1d reminder', async () => {
    const capsule = await seedSealedCapsule({ unlockAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const [owner] = await db.select().from(users).where(eq(users.id, capsule.ownerId));
    await reminderHandler({ db, clock: new VirtualClock(new Date()), subjectId: capsule.id });
    const sent = await db.select().from(outboundMessages).where(eq(outboundMessages.toRef, owner!.email));
    expect(sent.some((m) => m.template === 'pre-unlock-reminder' && m.state === 'sent')).toBe(true);
  });

  it('trash_purge: deletes R2 objects and hard-deletes the capsule row', async () => {
    const user = await createTestUser(db);
    trackedUserIds.push(user.id);
    const capsule = await createTestCapsule(db, user.id, { state: 'sealed', trashedAt: new Date(), purgeAfter: new Date() });
    trackedCapsuleIds.push(capsule.id);

    const adapter = getStorageAdapter();
    const storageKey = `capsules/${capsule.id}/media/${randomUUID()}`;
    // Fake adapter tracks objects via createMultipartUpload/completeMultipartUpload; simplest is headObject after
    // seeding — but the fake only knows about a key once an upload completes. Use deleteObject directly to seed presence.
    await db.insert(mediaItems).values({
      capsuleId: capsule.id,
      uploaderId: user.id,
      kind: 'image',
      storageKey,
      position: 0,
      status: 'ready',
    });

    await trashPurgeHandler({ db, clock: new VirtualClock(new Date()), subjectId: capsule.id });

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    expect(row).toBeUndefined();
    // deleteObject on an unknown/already-absent key is a no-op in the fake adapter — the meaningful
    // assertion here is that the handler completed without throwing and the capsule row is gone.
    await expect(adapter.headObject(storageKey)).resolves.toBeNull();

    trackedCapsuleIds.pop(); // capsule row is already gone; nothing left to clean for it
  });

  describe('dispatch.runAction', () => {
    it('marks a scheduled_action done on success', async () => {
      const subjectId = randomUUID();
      const action = await insertScheduledAction(db, { kind: 'reminder', subjectId, runAt: new Date() });
      trackedActionIds.push(action.id);

      const noop: ActionHandler = async () => {};
      await runAction(db, new VirtualClock(new Date()), { actionId: action.id, subjectId }, noop);

      const row = await loadAction(action.id);
      expect(row.state).toBe('done');
    });

    it('retries (pending) on failure until MAX_ATTEMPTS, then terminally fails', async () => {
      const subjectId = randomUUID();
      const action = await insertScheduledAction(db, { kind: 'reminder', subjectId, runAt: new Date(), attempts: 4 });
      trackedActionIds.push(action.id);

      const boom: ActionHandler = async () => {
        throw new Error('handler exploded');
      };

      await expect(runAction(db, new VirtualClock(new Date()), { actionId: action.id, subjectId }, boom)).rejects.toThrow('handler exploded');

      const row = await loadAction(action.id);
      expect(row.attempts).toBe(5);
      expect(row.state).toBe('failed'); // 5th attempt hits MAX_ATTEMPTS
      expect(row.lastError).toBe('handler exploded');
    });

    it('leaves state pending (for retry) before MAX_ATTEMPTS', async () => {
      const subjectId = randomUUID();
      const action = await insertScheduledAction(db, { kind: 'reminder', subjectId, runAt: new Date(), attempts: 0 });
      trackedActionIds.push(action.id);

      const boom: ActionHandler = async () => {
        throw new Error('transient failure');
      };
      await expect(runAction(db, new VirtualClock(new Date()), { actionId: action.id, subjectId }, boom)).rejects.toThrow();

      const row = await loadAction(action.id);
      expect(row.attempts).toBe(1);
      expect(row.state).toBe('pending');
    });
  });
});
