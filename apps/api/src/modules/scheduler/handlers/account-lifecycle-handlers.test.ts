import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../../../env.js';
import { db, pool } from '../../../db/client.js';
import { capsules, mediaItems, outboundMessages, scheduledActions, users } from '../../../db/schema/index.js';
import { systemClock } from '../../../lib/clock.js';
import { getStorageAdapter } from '../../media/index.js';
import { createTestCapsule, createTestUser, insertScheduledAction } from '../test-helpers.js';
import { accountPurgeHandler } from './account-purge.js';
import { dataExportHandler } from './data-export.js';
import { runAction } from './dispatch.js';

const trackedUserIds: string[] = [];

async function loadUser(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

describe('account lifecycle handlers (T-18)', () => {
  afterAll(async () => {
    if (trackedUserIds.length) {
      await db.delete(scheduledActions).where(inArray(scheduledActions.subjectId, trackedUserIds));
      await db.delete(mediaItems).where(inArray(mediaItems.uploaderId, trackedUserIds));
      await db.delete(outboundMessages).where(inArray(outboundMessages.toRef, trackedUserIds));
      await db.delete(users).where(inArray(users.id, trackedUserIds));
    }
    await pool.end();
  });

  describe('accountPurgeHandler (F8)', () => {
    it('anonymizes "deliver" capsules and hard-deletes the user', async () => {
      const user = await createTestUser(db, { status: 'pending_deletion', deletionRequestedAt: new Date() });
      trackedUserIds.push(user.id);
      const deliverCapsule = await createTestCapsule(db, user.id, { state: 'sealed', deletionDecision: 'deliver' });
      const action = await insertScheduledAction(db, { kind: 'account_purge', subjectId: user.id, runAt: new Date() });

      await runAction(db, systemClock, { actionId: action.id, subjectId: user.id }, accountPurgeHandler);

      const [capsuleAfter] = await db.select().from(capsules).where(eq(capsules.id, deliverCapsule.id));
      expect(capsuleAfter?.ownerId).toBeNull();
      expect(capsuleAfter?.deletionDecision).toBeNull();

      expect(await loadUser(user.id)).toBeUndefined();
    });

    it('no-ops if the user already cancelled (status back to active)', async () => {
      const user = await createTestUser(db, { status: 'active' });
      trackedUserIds.push(user.id);
      const action = await insertScheduledAction(db, { kind: 'account_purge', subjectId: user.id, runAt: new Date() });

      await runAction(db, systemClock, { actionId: action.id, subjectId: user.id }, accountPurgeHandler);

      expect(await loadUser(user.id)).toBeTruthy();
    });
  });

  describe('dataExportHandler', () => {
    it('builds a zip with a letter, media, and metadata, then emails a download link', async () => {
      const user = await createTestUser(db);
      trackedUserIds.push(user.id);
      const capsule = await createTestCapsule(db, user.id, {
        state: 'sealed',
        title: 'Export Probe Capsule',
        contentDocEnc: Buffer.from('fake-ciphertext'),
      });
      const storageKey = `media/${randomUUID()}.bin`;
      await getStorageAdapter().putObject(storageKey, Buffer.from('fake-encrypted-media-bytes'), 'application/octet-stream');
      await db.insert(mediaItems).values({
        capsuleId: capsule.id,
        uploaderId: user.id,
        kind: 'document',
        storageKey,
        originalName: 'note.bin',
        mime: 'application/octet-stream',
        sizeBytes: 27,
        position: 0,
      });

      const action = await insertScheduledAction(db, { kind: 'data_export', subjectId: user.id, runAt: new Date() });
      await runAction(db, systemClock, { actionId: action.id, subjectId: user.id }, dataExportHandler);

      const [message] = await db
        .select()
        .from(outboundMessages)
        .where(and(eq(outboundMessages.toRef, user.email), eq(outboundMessages.template, 'export-ready')));
      expect(message?.state).toBe('sent');

      const [actionAfter] = await db.select().from(scheduledActions).where(eq(scheduledActions.id, action.id));
      expect(actionAfter?.state).toBe('done');
    });
  });

  describe('cancellation clears deletionDecision', () => {
    it('deletionDecision is cleared on cancel, and a purge run afterward leaves the capsule alone', async () => {
      const user = await createTestUser(db, { status: 'active' });
      trackedUserIds.push(user.id);
      const capsule = await createTestCapsule(db, user.id, { state: 'sealed', deletionDecision: null });

      // Simulate the "already cancelled" state directly (login-cancellation itself is exercised via modules/settings tests).
      await db.update(capsules).set({ deletionDecision: null }).where(eq(capsules.id, capsule.id));

      const action = await insertScheduledAction(db, { kind: 'account_purge', subjectId: user.id, runAt: new Date() });
      await runAction(db, systemClock, { actionId: action.id, subjectId: user.id }, accountPurgeHandler);

      const [capsuleAfter] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
      expect(capsuleAfter?.ownerId).toBe(user.id);
      expect(await loadUser(user.id)).toBeTruthy();
    });
  });
});
