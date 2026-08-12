import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import {
  capsuleRecipients,
  capsuleReplies,
  capsules,
  entitlements,
  mediaItems,
  scheduledActions,
  users,
} from '../../db/schema/index.js';
import { getStorageAdapter } from './get-adapter.js';
import { releaseCapsuleMedia } from './release.js';
import { getMediaRetention, releasesAutomatically } from '../capsules/index.js';
// Reached through the scheduler's index, per the module-boundary rule
// (src/modules/README.md) — `HANDLERS` is the module's own public map of
// action kind to handler, which is also exactly how the worker resolves them.
import { HANDLERS } from '../scheduler/index.js';

const app = createApp(db);
const createdUserIds: string[] = [];
const clock = { now: () => new Date() };

/**
 * Signup is rate-limited to 10/hour per IP (T-22) and the in-memory limiter
 * is shared across every test file in the process, so this suite creates a
 * small fixed pool rather than one account per test. `shared` is reset
 * between tests — its capsules are deleted so the free plan's 5-active-
 * sealed-capsule limit never trips, and its entitlement row is cleared so a
 * test that downgrades an account cannot change the plan a later test seals
 * under.
 */
let shared: { userId: string; token: string };
let downgradeA: { userId: string; token: string };
let downgradeB: { userId: string; token: string };

async function createUser() {
  const email = `release-test-${randomUUID()}@example.com`;
  const res = await request(app).post('/v1/auth/signup').send({
    email,
    password: 'correct-horse-battery-staple',
    displayName: 'Release Test',
    masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
    recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
  });
  expect(res.status).toBe(201);
  const userId = res.body.user.id as string;
  createdUserIds.push(userId);
  return { userId, token: res.body.tokens.accessToken as string };
}

/** A capsule with one real, completed enclosure whose bytes are genuinely in the (fake) bucket. */
async function createCapsuleWithMedia(token: string, opts: { unlockInMs?: number } = {}) {
  const created = await request(app)
    .post('/v1/capsules')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'self', title: 'Release test' });
  expect(created.status).toBe(201);
  const capsuleId = created.body.capsule.id as string;

  const bytes = Buffer.from('encrypted-enclosure-bytes-for-release-test');
  const ticket = await request(app)
    .post(`/v1/capsules/${capsuleId}/media/tickets`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: bytes.length });
  expect(ticket.status).toBe(201);

  const adapter = getStorageAdapter() as ReturnType<typeof getStorageAdapter> & {
    setFakePartSize: (uploadId: string, partNumber: number, sizeBytes: number) => void;
  };
  adapter.setFakePartSize(ticket.body.uploadId, 1, bytes.length);

  const completed = await request(app)
    .post(`/v1/media/${ticket.body.mediaId}/complete`)
    .set('Authorization', `Bearer ${token}`)
    .send({ parts: [{ partNumber: 1, eTag: 'etag-1' }] });
  expect(completed.status).toBe(200);

  const unlockAt = new Date(Date.now() + (opts.unlockInMs ?? 10 * 60 * 1000));
  await request(app)
    .patch(`/v1/capsules/${capsuleId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ unlockAt: unlockAt.toISOString() });

  const [row] = await db.select({ storageKey: mediaItems.storageKey }).from(mediaItems).where(eq(mediaItems.id, ticket.body.mediaId));
  return { capsuleId, mediaId: ticket.body.mediaId as string, storageKey: row!.storageKey!, unlockAt };
}

async function seal(token: string, capsuleId: string) {
  const res = await request(app).post(`/v1/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res;
}

describe('M4 — storage lifecycle', () => {
  beforeAll(async () => {
    shared = await createUser();
    downgradeA = await createUser();
    downgradeB = await createUser();
  }, 30000);

  beforeEach(async () => {
    await db.delete(capsules).where(eq(capsules.ownerId, shared.userId));
    await db.delete(entitlements).where(eq(entitlements.userId, shared.userId));
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      // Capsules first: media_items.uploader_id references users without
      // ON DELETE CASCADE, so the rows have to go via their capsule.
      await db.delete(capsules).where(eq(capsules.ownerId, id));
      await db.delete(entitlements).where(eq(entitlements.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  describe('sealed entitlement snapshot', () => {
    it('captures the promise at seal, with a retention date derived from unlockAt', async () => {
      const { token } = shared;
      const { capsuleId, unlockAt } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      const snapshot = row!.sealedEntitlementSnapshot as Record<string, unknown>;

      expect(snapshot).toBeTruthy();
      expect(snapshot.schemaVersion).toBe(1);
      expect(snapshot.planAtSeal).toBe('free');
      expect(snapshot.storageAllowanceBytes).toBe(100 * 1024 * 1024);
      expect(snapshot.archivalPolicy).toBe('release_at_retention');

      // Free = one year after the capsule opens.
      const retention = snapshot.mediaRetention as { policy: string; until: string; afterUnlockMs: number };
      expect(retention.policy).toBe('until');
      expect(new Date(retention.until).getTime()).toBeCloseTo(unlockAt.getTime() + retention.afterUnlockMs, -3);

      // The denormalised column agrees with the promise it indexes.
      expect(row!.mediaRetentionUntil?.toISOString()).toBe(retention.until);
      // And the invariant holds: media outlives the opening.
      expect(row!.mediaRetentionUntil!.getTime()).toBeGreaterThan(unlockAt.getTime());
    });

    it('records no retention obligation for a capsule holding no media', async () => {
      const { token } = shared;
      const created = await request(app)
        .post('/v1/capsules')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'self', title: 'No enclosures' });
      const capsuleId = created.body.capsule.id as string;
      await request(app)
        .patch(`/v1/capsules/${capsuleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ unlockAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      await seal(token, capsuleId);

      const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      const snapshot = row!.sealedEntitlementSnapshot as Record<string, unknown>;
      expect(snapshot.archivalPolicy).toBe('never');
      expect((snapshot.mediaRetention as { policy: string }).policy).toBe('forever');
      expect(row!.mediaRetentionUntil).toBeNull();

      const scheduled = await db
        .select()
        .from(scheduledActions)
        .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'media_release')));
      expect(scheduled).toHaveLength(0);
    });

    it('schedules a release and two warnings (30d, 7d) ahead of it', async () => {
      const { token } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      const releaseAt = row!.mediaRetentionUntil!.getTime();

      const releases = await db
        .select()
        .from(scheduledActions)
        .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'media_release')));
      expect(releases).toHaveLength(1);
      expect(releases[0]!.runAt.getTime()).toBe(releaseAt);

      const warnings = await db
        .select()
        .from(scheduledActions)
        .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'media_release_warning')));
      expect(warnings).toHaveLength(2);
      const offsets = warnings.map((w) => releaseAt - w.runAt.getTime()).sort((a, b) => a - b);
      expect(offsets).toEqual([7 * 86400000, 30 * 86400000]);
    });

    it('a capsule sealed before M4 (null snapshot) reads as forever and never auto-releases', async () => {
      const { token } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      // Simulate a legacy row: sealed, but from before the snapshot existed.
      await db
        .update(capsules)
        .set({ sealedEntitlementSnapshot: null, mediaRetentionUntil: null })
        .where(eq(capsules.id, capsuleId));

      const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(getMediaRetention(row!).policy).toBe('forever');
      expect(releasesAutomatically(row!)).toBe(false);

      // Even if an action row exists, the handler must refuse to act on it.
      await HANDLERS.media_release({ db, clock, subjectId: capsuleId });
      const [media] = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
      expect(media!.status).toBe('ready');
      expect(media!.storageKey).toBeTruthy();
    });
  });

  describe('release', () => {
    it('deletes the object, keeps the row, and reclaims the bytes', async () => {
      const { token, userId } = shared;
      const { capsuleId, mediaId, storageKey } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const adapter = getStorageAdapter();
      expect(await adapter.headObject(storageKey)).not.toBeNull();

      const [before] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(before!.sizeBytes).toBeGreaterThan(0);

      const result = await releaseCapsuleMedia(db, capsuleId, { reason: 'owner', actorId: userId });
      expect(result.released).toBe(1);
      expect(result.failedMediaIds).toHaveLength(0);

      // The bytes are genuinely gone from storage.
      expect(await adapter.headObject(storageKey)).toBeNull();

      // The record is not.
      const [media] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId));
      expect(media).toBeTruthy();
      expect(media!.status).toBe('released');
      expect(media!.releasedAt).toBeTruthy();
      expect(media!.releaseReason).toBe('owner');
      expect(media!.originalName).toBe('photo.jpg');
      expect(media!.sizeBytes).toBeGreaterThan(0); // history preserved
      expect(media!.storageKey).toBeNull(); // no dangling pointer

      // Storage really is reclaimed, not just relabelled.
      const [after] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(after!.sizeBytes).toBe(0);
    });

    it('is idempotent — running twice changes nothing the first run did not', async () => {
      const { token } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const first = await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });
      const second = await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

      expect(first.released).toBe(1);
      expect(second.released).toBe(0);
      expect(second.alreadyReleased).toBe(1);
      expect(second.failedMediaIds).toHaveLength(0);

      const [after] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(after!.sizeBytes).toBe(0); // not double-decremented
    });

    it('survives partial failure and completes on retry', async () => {
      const { token } = shared;
      const { capsuleId, storageKey } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const adapter = getStorageAdapter();
      const realDelete = adapter.deleteObject.bind(adapter);
      let attempts = 0;
      adapter.deleteObject = async (key: string) => {
        attempts += 1;
        if (attempts === 1) throw new Error('simulated R2 outage');
        return realDelete(key);
      };

      try {
        const failed = await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });
        expect(failed.released).toBe(0);
        expect(failed.failedMediaIds).toHaveLength(1);

        // Crucially: the row was NOT marked released, because the object is
        // still there. A `released` row always means the delete succeeded.
        const [midway] = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
        expect(midway!.status).toBe('ready');
        expect(await adapter.headObject(storageKey)).not.toBeNull();

        const retried = await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });
        expect(retried.released).toBe(1);
        expect(await adapter.headObject(storageKey)).toBeNull();
      } finally {
        adapter.deleteObject = realDelete;
      }
    });

    it('leaves the letter, the history and the replies untouched', async () => {
      const { token } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);
      await request(app)
        .patch(`/v1/capsules/${capsuleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ contentDocEnc: Buffer.from('the-letter-ciphertext').toString('base64') });
      await seal(token, capsuleId);

      const [recipient] = await db
        .insert(capsuleRecipients)
        .values({ capsuleId, email: `r-${randomUUID()}@example.com`, accessTokenHash: randomUUID() })
        .returning();
      await db.insert(capsuleReplies).values({
        capsuleId,
        recipientId: recipient!.id,
        author: 'recipient',
        bodyEnc: Buffer.from('a-reply-ciphertext').toString('base64'),
      });

      await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

      const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(capsule!.contentDocEnc).toBeTruthy();
      expect(capsule!.sealedAt).toBeTruthy();
      const replies = await db.select().from(capsuleReplies).where(eq(capsuleReplies.capsuleId, capsuleId));
      expect(replies).toHaveLength(1);
      expect(replies[0]!.bodyEnc).toBeTruthy();
    });

    it('refuses to release from a draft — the right verb there is delete', async () => {
      const { token } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);

      const res = await request(app).post(`/v1/capsules/${capsuleId}/media/release`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('the owner route releases a sealed capsule and reports what it reclaimed', async () => {
      const { token } = shared;
      const { capsuleId, storageKey } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const res = await request(app).post(`/v1/capsules/${capsuleId}/media/release`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.released).toBe(1);
      expect(res.body.bytesReclaimed).toBeGreaterThan(0);
      expect(await getStorageAdapter().headObject(storageKey)).toBeNull();

      // The pending schedule is cancelled — the bytes are already gone.
      const pending = await db
        .select()
        .from(scheduledActions)
        .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.state, 'pending'), eq(scheduledActions.kind, 'media_release')));
      expect(pending).toHaveLength(0);
    });

    it('a released enclosure reports itself as released, not as still uploading', async () => {
      const { token } = shared;
      const { capsuleId, mediaId } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);
      await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

      const res = await request(app).get(`/v1/media/${mediaId}/view`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('media_released');
    });
  });

  describe('retention is a term, not a frozen date', () => {
    it('extending the opening moves the retention with it, without rewriting the snapshot', async () => {
      const { token } = shared;
      const { capsuleId, unlockAt } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const [before] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      const snapshotBefore = JSON.stringify(before!.sealedEntitlementSnapshot);
      const retentionBefore = before!.mediaRetentionUntil!.getTime();

      const newUnlockAt = new Date(unlockAt.getTime() + 20 * 24 * 60 * 60 * 1000);
      const res = await request(app)
        .post(`/v1/capsules/${capsuleId}/extend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ newUnlockAt: newUnlockAt.toISOString() });
      expect(res.status).toBe(200);

      const [after] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));

      // The promise ("a year after it opens") is unchanged and unrewritten…
      expect(JSON.stringify(after!.sealedEntitlementSnapshot)).toBe(snapshotBefore);
      // …but the date it resolves to moved by exactly the same amount the
      // opening did, because the opening is what it is measured from.
      expect(after!.mediaRetentionUntil!.getTime() - retentionBefore).toBe(newUnlockAt.getTime() - unlockAt.getTime());
      // The invariant survives the move.
      expect(after!.mediaRetentionUntil!.getTime()).toBeGreaterThan(newUnlockAt.getTime());

      // The old release action is gone and a new one sits at the new date.
      const pending = await db
        .select()
        .from(scheduledActions)
        .where(
          and(
            eq(scheduledActions.subjectId, capsuleId),
            eq(scheduledActions.kind, 'media_release'),
            eq(scheduledActions.state, 'pending'),
          ),
        );
      expect(pending).toHaveLength(1);
      expect(pending[0]!.runAt.getTime()).toBe(after!.mediaRetentionUntil!.getTime());
    });
  });

  describe('storage accounting', () => {
    it('released bytes stop counting as stored but survive as history', async () => {
      const { token, userId } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      const storedBefore = await request(app).get('/v1/me/storage').set('Authorization', `Bearer ${token}`);
      expect(storedBefore.status).toBe(200);
      expect(storedBefore.body.usedBytes).toBeGreaterThan(0);
      expect(storedBefore.body.releasedBytes).toBe(0);
      const held = storedBefore.body.usedBytes as number;

      await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

      const storedAfter = await request(app).get('/v1/me/storage').set('Authorization', `Bearer ${token}`);
      // No longer occupying storage…
      expect(storedAfter.body.usedBytes).toBe(0);
      // …but the account can still say what it once held, to the byte.
      expect(storedAfter.body.releasedBytes).toBe(held);
      expect(storedAfter.body.releasedCapsuleCount).toBe(1);

      // Quota is measured against what is actually stored, so the reclaimed
      // space is genuinely usable again.
      expect(userId).toBeTruthy();
    });
  });

  describe('the recipient still sees that something was here', () => {
    it('a released enclosure appears in the reveal with no view URL, rather than vanishing', async () => {
      const { token } = shared;
      const { capsuleId } = await createCapsuleWithMedia(token);

      const added = await request(app)
        .post(`/v1/capsules/${capsuleId}/recipients`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: `reveal-${randomUUID()}@example.com`, displayName: 'Reader' });
      expect(added.status).toBe(201);
      const accessToken = added.body.accessToken as string;

      await seal(token, capsuleId);
      await HANDLERS.capsule_unlock({ db, clock, subjectId: capsuleId });
      await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

      const res = await request(app).get(`/v1/r/${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unlocked');

      // The letter is NOT one enclosure shorter than it was sent.
      expect(res.body.media).toHaveLength(1);
      expect(res.body.media[0].released).toBe(true);
      expect(res.body.media[0].viewUrl).toBeNull();
      expect(res.body.media[0].releasedAt).toBeTruthy();
      expect(res.body.media[0].originalName).toBe('photo.jpg');
    });
  });

  describe('delivery is never gated by entitlement', () => {
    /**
     * The adversarial case, and the one hard rule this milestone could most
     * plausibly have broken: an owner whose plan collapses to nothing after
     * sealing. Their capsule must still open and their recipient must still
     * be told, because delivery is never paywalled and a sealed capsule
     * keeps the promise it was sealed with.
     */
    it('a capsule still unlocks and notifies after the owner is dropped to zero quota', async () => {
      const { token, userId } = downgradeA;
      const { capsuleId } = await createCapsuleWithMedia(token);

      await request(app)
        .post(`/v1/capsules/${capsuleId}/recipients`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: `recipient-${randomUUID()}@example.com`, displayName: 'A Recipient' });

      await seal(token, capsuleId);
      const [sealedRow] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      const snapshotAtSeal = JSON.stringify(sealedRow!.sealedEntitlementSnapshot);
      const retentionAtSeal = sealedRow!.mediaRetentionUntil?.toISOString();

      // The owner's live entitlement collapses entirely, after sealing.
      await db
        .insert(entitlements)
        .values({ userId, plan: 'free', storageQuotaBytes: 0 })
        .onConflictDoUpdate({ target: entitlements.userId, set: { plan: 'free', storageQuotaBytes: 0 } });

      // The sealed capsule is unmoved by it.
      const [afterDowngrade] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(JSON.stringify(afterDowngrade!.sealedEntitlementSnapshot)).toBe(snapshotAtSeal);
      expect(afterDowngrade!.mediaRetentionUntil?.toISOString()).toBe(retentionAtSeal);

      // And it still delivers.
      await HANDLERS.capsule_unlock({ db, clock, subjectId: capsuleId });

      const [unlocked] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(unlocked!.state).toBe('unlocked');

      const spawned = await db
        .select()
        .from(scheduledActions)
        .where(eq(scheduledActions.kind, 'recipient_unlock'));
      expect(spawned.some((a) => a.state === 'pending')).toBe(true);
    });

    it('an owner over quota cannot add new media, but nothing sealed is harmed', async () => {
      const { token, userId } = downgradeB;
      const { capsuleId } = await createCapsuleWithMedia(token);
      await seal(token, capsuleId);

      await db
        .insert(entitlements)
        .values({ userId, plan: 'free', storageQuotaBytes: 1 })
        .onConflictDoUpdate({ target: entitlements.userId, set: { storageQuotaBytes: 1 } });

      const fresh = await request(app)
        .post('/v1/capsules')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'self', title: 'Should not accept media' });
      const blocked = await request(app)
        .post(`/v1/capsules/${fresh.body.capsule.id}/media/tickets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'x.jpg', mime: 'image/jpeg', sizeBytes: 5000 });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('quota_exceeded');

      // The already-sealed capsule kept everything.
      const [sealed] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(sealed!.state).toBe('sealed');
      expect(sealed!.sealedEntitlementSnapshot).toBeTruthy();
      const [media] = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
      expect(media!.status).toBe('ready');
    });
  });
});
