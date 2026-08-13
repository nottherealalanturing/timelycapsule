import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsules, guestSessions, mediaItems, scheduledActions, users } from '../../db/schema/index.js';
import { getStorageAdapter, releaseCapsuleMedia } from '../media/index.js';
import { HANDLERS } from '../scheduler/index.js';
import { systemClock } from '../../lib/clock.js';
import { signup } from '../auth/index.js';
import { GUEST_STORAGE_ALLOWANCE_BYTES } from '../../lib/guest-limits.js';

const app = createApp(db);
const trackedCapsuleIds: string[] = [];
const trackedSessionIds: string[] = [];
const trackedUserIds: string[] = [];

async function createGuestSession(appInstance: ReturnType<typeof createApp> = app): Promise<string> {
  const res = await request(appInstance).post('/v1/guest/sessions').expect(201);
  return res.body.guestToken as string;
}

async function createDraftCapsule(guestToken: string, appInstance: ReturnType<typeof createApp> = app): Promise<string> {
  const res = await request(appInstance)
    .post('/v1/guest/capsules')
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ title: 'A note to the future' })
    .expect(201);
  trackedCapsuleIds.push(res.body.id);
  return res.body.id as string;
}

/** Real ticket → real (fake-adapter) bytes → real complete, exactly the sequence the browser performs. */
async function encloseRealFile(guestToken: string, capsuleId: string, sizeBytes: number, name = 'photo.jpg') {
  const { mediaId, complete } = await ticketThenComplete(guestToken, capsuleId, { declaredBytes: sizeBytes, actualBytes: sizeBytes, name });
  expect(complete.status).toBe(200);
  return { mediaId, media: complete.body.media };
}

/**
 * Storage-integrity fix — lets a test declare one size at ticket time and
 * land a *different* real size in the (fake) bucket before completing, the
 * exact shape of the under-declare-then-overupload bypass this fix closes.
 * Returns the raw (un-asserted) `complete` response so a test can check
 * either outcome, plus the media row's storage key for cleanup checks.
 *
 * Takes its own `app` instance (a fresh `createApp(db)` per test in the
 * storage-integrity describe block below) rather than the module's shared
 * one — the `/guest/capsules` create route is rate-limited to 10/hour per
 * IP, and this fix's tests alone create more capsules than that shared
 * budget allows; a fresh app gets a fresh in-memory rate-limit bucket
 * (`rateLimit()` closes over a new `Map` each time `guestRouter(db)` is
 * constructed), the same pattern `media.test.ts`'s `createUser()` already
 * uses for the same reason.
 */
async function ticketThenComplete(
  guestToken: string,
  capsuleId: string,
  opts: { declaredBytes: number; actualBytes: number; name?: string },
  appInstance: ReturnType<typeof createApp> = app,
) {
  const ticket = await request(appInstance)
    .post(`/v1/guest/capsules/${capsuleId}/media/tickets`)
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ name: opts.name ?? 'photo.jpg', mime: 'image/jpeg', sizeBytes: opts.declaredBytes })
    .expect(201);

  const mediaId = ticket.body.mediaId as string;
  const [row] = await db.select({ storageKey: mediaItems.storageKey }).from(mediaItems).where(eq(mediaItems.id, mediaId));

  const adapter = getStorageAdapter() as ReturnType<typeof getStorageAdapter> & {
    setFakePartSize: (uploadId: string, partNumber: number, sizeBytes: number) => void;
  };
  adapter.setFakePartSize(ticket.body.uploadId, 1, opts.actualBytes);

  const complete = await request(appInstance)
    .post(`/v1/guest/media/${mediaId}/complete`)
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ parts: [{ partNumber: 1, eTag: 'etag-1' }] });

  return { mediaId, storageKey: row!.storageKey as string, complete };
}

describe('guest media (M5)', () => {
  afterAll(async () => {
    for (const id of trackedCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of trackedSessionIds) {
      await db.delete(guestSessions).where(eq(guestSessions.id, id));
    }
    for (const id of trackedUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('encloses a real file through the real ticket → complete lifecycle and reaches ready', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);

    const { media } = await encloseRealFile(guestToken, capsuleId, 1024);
    expect(media.status).toBe('ready');
    expect(media.originalName).toBe('photo.jpg');

    const list = await request(app)
      .get(`/v1/guest/capsules/${capsuleId}/media`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('rejects an enclosure that would push the session over its 5 MB allowance, and never creates a row for it', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);

    const res = await request(app)
      .post(`/v1/guest/capsules/${capsuleId}/media/tickets`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ name: 'huge.jpg', mime: 'image/jpeg', sizeBytes: GUEST_STORAGE_ALLOWANCE_BYTES + 1 })
      .expect(403);

    expect(res.body.error.code).toBe('guest_quota_exceeded');

    // Not silently discarded and not silently created either — the ticket
    // genuinely never came into existence, so there is nothing orphaned to
    // clean up and nothing that could confuse a later readiness check.
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
    expect(rows).toHaveLength(0);
  });

  describe('storage-integrity fix — the actual object size, not the declared one, is authoritative', () => {
    it('rejects at completion when the declared size fits but the real uploaded size does not (1 MB declared, 6 MB actual)', async () => {
      const testApp = createApp(db);
      const guestToken = await createGuestSession(testApp);
      const capsuleId = await createDraftCapsule(guestToken, testApp);

      const { mediaId, storageKey, complete } = await ticketThenComplete(
        guestToken,
        capsuleId,
        { declaredBytes: 1 * 1024 * 1024, actualBytes: 6 * 1024 * 1024 },
        testApp,
      );

      expect(complete.status).toBe(403);
      expect(complete.body.error.code).toBe('guest_quota_exceeded');

      // No usable ready row left behind.
      const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId));
      expect(rows).toHaveLength(0);

      // The capsule's recorded usage never moved.
      const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(capsule!.sizeBytes).toBe(0);

      // The object itself is gone from storage, not left dangling.
      const adapter = getStorageAdapter();
      expect(await adapter.headObject(storageKey)).toBeNull();
    });

    it('accepts when the declared size overstates the real upload (6 MB declared, 1 MB actual)', async () => {
      const testApp = createApp(db);
      const guestToken = await createGuestSession(testApp);
      const capsuleId = await createDraftCapsule(guestToken, testApp);

      // 6 MB alone would fail the *ticket-time* check against a 5 MB
      // allowance, so this proves the declared figure is only ever a
      // ceiling for that pre-check — never used to compute what actually
      // gets recorded.
      const { complete } = await ticketThenComplete(
        guestToken,
        capsuleId,
        { declaredBytes: 4 * 1024 * 1024, actualBytes: 1 * 1024 * 1024 },
        testApp,
      );

      expect(complete.status).toBe(200);
      expect(complete.body.media.status).toBe('ready');
      expect(complete.body.media.sizeBytes).toBe(1 * 1024 * 1024);

      const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      expect(capsule!.sizeBytes).toBe(1 * 1024 * 1024);
    });

    it('cannot bypass the 5 MB allowance through a series of individually under-declared tickets', async () => {
      const testApp = createApp(db);
      const guestToken = await createGuestSession(testApp);
      const capsuleId = await createDraftCapsule(guestToken, testApp);

      // Each ticket declares a negligible size (so the ticket-time check,
      // which only ever looks at bytes already committed, never objects),
      // but each real upload is a genuine 2 MB. Two land; the third's real
      // bytes would push the session to 6 MB.
      const first = await ticketThenComplete(guestToken, capsuleId, { declaredBytes: 1024, actualBytes: 2 * 1024 * 1024, name: 'a.jpg' }, testApp);
      expect(first.complete.status).toBe(200);
      const second = await ticketThenComplete(guestToken, capsuleId, { declaredBytes: 1024, actualBytes: 2 * 1024 * 1024, name: 'b.jpg' }, testApp);
      expect(second.complete.status).toBe(200);
      const third = await ticketThenComplete(guestToken, capsuleId, { declaredBytes: 1024, actualBytes: 2 * 1024 * 1024, name: 'c.jpg' }, testApp);

      expect(third.complete.status).toBe(403);
      expect(third.complete.body.error.code).toBe('guest_quota_exceeded');

      const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      // Exactly the two accepted uploads — the third's bytes never counted.
      expect(capsule!.sizeBytes).toBe(4 * 1024 * 1024);

      const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === 'ready')).toBe(true);
    });

    it('two concurrent completions that individually fit but together exceed the allowance: exactly one is accepted', async () => {
      const testApp = createApp(db);
      const guestToken = await createGuestSession(testApp);
      const capsuleId = await createDraftCapsule(guestToken, testApp);

      // Both tickets are created (and both individually fit — 0 used at
      // ticket time for each) before either completes, then raced.
      const ticketA = await request(testApp)
        .post(`/v1/guest/capsules/${capsuleId}/media/tickets`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'race-a.jpg', mime: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);
      const ticketB = await request(testApp)
        .post(`/v1/guest/capsules/${capsuleId}/media/tickets`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'race-b.jpg', mime: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      const adapter = getStorageAdapter() as ReturnType<typeof getStorageAdapter> & {
        setFakePartSize: (uploadId: string, partNumber: number, sizeBytes: number) => void;
      };
      const eachBytes = 3 * 1024 * 1024; // 3 MB + 3 MB = 6 MB, over the 5 MB allowance together.
      adapter.setFakePartSize(ticketA.body.uploadId, 1, eachBytes);
      adapter.setFakePartSize(ticketB.body.uploadId, 1, eachBytes);

      const [resA, resB] = await Promise.all([
        request(testApp)
          .post(`/v1/guest/media/${ticketA.body.mediaId}/complete`)
          .set('Authorization', `Bearer ${guestToken}`)
          .send({ parts: [{ partNumber: 1, eTag: 'etag-a' }] }),
        request(testApp)
          .post(`/v1/guest/media/${ticketB.body.mediaId}/complete`)
          .set('Authorization', `Bearer ${guestToken}`)
          .send({ parts: [{ partNumber: 1, eTag: 'etag-b' }] }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      // Exactly one accepted, one rejected — not both accepted (the race
      // this fix closes) and not both rejected (over-cautious locking).
      expect(statuses).toEqual([200, 403]);

      const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
      // Whichever one won, the recorded usage is exactly one upload's worth
      // — never the sum of both, and never zero.
      expect(capsule!.sizeBytes).toBe(eachBytes);

      const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('ready');
    });
  });

  it('one guest session cannot read, patch, or delete another session\'s media', async () => {
    const ownerToken = await createGuestSession();
    const ownerCapsuleId = await createDraftCapsule(ownerToken);
    const { mediaId } = await encloseRealFile(ownerToken, ownerCapsuleId, 512);

    // The intruder needs no capsule of their own — the target media belongs
    // to someone else's regardless of what the intruder does or doesn't hold.
    const intruderToken = await createGuestSession();

    const view = await request(app).get(`/v1/guest/media/${mediaId}/view`).set('Authorization', `Bearer ${intruderToken}`);
    expect(view.status).toBe(404);

    const patch = await request(app)
      .patch(`/v1/guest/media/${mediaId}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({ caption: 'not yours' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/v1/guest/media/${mediaId}`).set('Authorization', `Bearer ${intruderToken}`);
    expect(del.status).toBe(404);

    const list = await request(app).get(`/v1/guest/capsules/${ownerCapsuleId}/media`).set('Authorization', `Bearer ${intruderToken}`);
    expect(list.status).toBe(404);
  });

  it('a guest bearer token cannot reach reverse geocoding — no anonymous lookup exists', async () => {
    const guestToken = await createGuestSession();
    const res = await request(app)
      .post('/v1/places/reverse-geocode')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ lat: 6.5, lng: 3.3 });
    // requireAuth() expects a real user JWT; a guest session token fails to
    // verify as one. Same 401 an unauthenticated request gets — a guest
    // token confers no more access here than no token at all.
    expect(res.status).toBe(401);
  });

  it('rejects sealing while an enclosure is still mid-transfer', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);

    // Ticket created, never completed — the same "abandoned mid-flight"
    // shape M4's orphaned-row handling was built for.
    await request(app)
      .post(`/v1/guest/capsules/${capsuleId}/media/tickets`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ name: 'still-going.jpg', mime: 'image/jpeg', sizeBytes: 1024 })
      .expect(201);

    await request(app)
      .patch(`/v1/guest/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ contentDocEnc: Buffer.from('letter').toString('base64'), unlockAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .expect(200);

    const res = await request(app).post(`/v1/guest/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${guestToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('upload_incomplete');
  });

  it('seal writes a sealed entitlement snapshot with 1-year-after-unlock retention, and schedules warnings + release', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);
    await encloseRealFile(guestToken, capsuleId, 2048);

    const unlockAt = new Date(Date.now() + 10 * 60 * 1000);
    await request(app)
      .patch(`/v1/guest/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ contentDocEnc: Buffer.from('letter').toString('base64'), unlockAt: unlockAt.toISOString() })
      .expect(200);

    await request(app).post(`/v1/guest/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(200);

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    const snapshot = row!.sealedEntitlementSnapshot as Record<string, unknown>;

    expect(snapshot).toBeTruthy();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.planAtSeal).toBe('guest');
    expect(snapshot.storageAllowanceBytes).toBe(GUEST_STORAGE_ALLOWANCE_BYTES);
    expect(snapshot.archivalPolicy).toBe('release_at_retention');

    const retention = snapshot.mediaRetention as { policy: string; until: string; afterUnlockMs: number };
    expect(retention.policy).toBe('until');
    // ~1 year after unlockAt.
    expect(new Date(retention.until).getTime()).toBeCloseTo(unlockAt.getTime() + retention.afterUnlockMs, -3);

    expect(row!.mediaRetentionUntil?.toISOString()).toBe(retention.until);
    // The invariant under direct test: retention never precedes opening.
    expect(row!.mediaRetentionUntil!.getTime()).toBeGreaterThanOrEqual(unlockAt.getTime());

    const releases = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'media_release')));
    expect(releases).toHaveLength(1);

    const warnings = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'media_release_warning')));
    expect(warnings).toHaveLength(2);
  });

  it('a guest capsule with no media gets no retention obligation at all', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);

    await request(app)
      .patch(`/v1/guest/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ contentDocEnc: Buffer.from('letter').toString('base64'), unlockAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .expect(200);
    await request(app).post(`/v1/guest/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(200);

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    const snapshot = row!.sealedEntitlementSnapshot as Record<string, unknown>;
    expect(snapshot.archivalPolicy).toBe('never');
    expect(row!.mediaRetentionUntil).toBeNull();

    const releases = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.subjectId, capsuleId), eq(scheduledActions.kind, 'media_release')));
    expect(releases).toHaveLength(0);
  });

  it('release works against a guest capsule via the existing M4 service — no second implementation', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);
    const { mediaId } = await encloseRealFile(guestToken, capsuleId, 4096);

    await request(app)
      .patch(`/v1/guest/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ contentDocEnc: Buffer.from('letter').toString('base64'), unlockAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .expect(200);
    await request(app).post(`/v1/guest/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(200);

    const result = await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });
    expect(result.released).toBe(1);

    const [media] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId));
    expect(media!.status).toBe('released');
    expect(media!.releasedAt).toBeTruthy();
    // The record survives — name, size, history — same M4 guarantee.
    expect(media!.originalName).toBe('photo.jpg');
    expect(media!.storageKey).toBeNull();

    const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    expect(capsule!.contentDocEnc).toBeTruthy();
    expect(capsule!.sealedAt).toBeTruthy();
  });

  it('an unclaimed guest capsule still unlocks on schedule even with media enclosed', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);
    await encloseRealFile(guestToken, capsuleId, 512);

    await request(app)
      .patch(`/v1/guest/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ contentDocEnc: Buffer.from('letter').toString('base64'), unlockAt: new Date(Date.now() + 6 * 60 * 1000).toISOString() })
      .expect(200);
    await request(app).post(`/v1/guest/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(200);

    await HANDLERS.capsule_unlock({ db, clock: systemClock, subjectId: capsuleId });

    const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    expect(capsule!.state).toBe('unlocked');
    expect(capsule!.ownerId).toBeNull();
  });

  /**
   * The flagship test for decision #1: claiming transfers ownership and
   * nothing else. A guest capsule sealed under Guest's 5 MB / 1-year terms
   * keeps exactly those terms after claim — it is not upgraded to Free's
   * 100 MB / forever just because an account now exists behind it.
   */
  it('claiming a guest capsule preserves its sealed entitlement snapshot and retention date byte-for-byte', async () => {
    const guestToken = await createGuestSession();
    const capsuleId = await createDraftCapsule(guestToken);
    await encloseRealFile(guestToken, capsuleId, 1024);

    const unlockAt = new Date(Date.now() + 10 * 60 * 1000);
    await request(app)
      .patch(`/v1/guest/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ contentDocEnc: Buffer.from('letter').toString('base64'), unlockAt: unlockAt.toISOString() })
      .expect(200);
    await request(app).post(`/v1/guest/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(200);

    const [beforeClaim] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    const snapshotBefore = JSON.stringify(beforeClaim!.sealedEntitlementSnapshot);
    const retentionBefore = beforeClaim!.mediaRetentionUntil?.toISOString();
    expect(beforeClaim!.ownerId).toBeNull();

    const email = `guest-media-claim-${randomUUID()}@example.com`;
    const { user } = await signup(
      db,
      { email, password: 'password123', displayName: 'Claimed Guest', masterKeyWrap: 'wrap', recoveryKeyWrap: 'recovery', guestToken },
      { platform: 'web', ip: '127.0.0.1', userAgent: 'vitest', deviceName: null },
    );
    trackedUserIds.push(user.id);

    const [afterClaim] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));

    // Ownership moved.
    expect(afterClaim!.ownerId).toBe(user.id);
    // The promise did not. Byte-for-byte — not "equivalent", identical.
    expect(JSON.stringify(afterClaim!.sealedEntitlementSnapshot)).toBe(snapshotBefore);
    expect(afterClaim!.mediaRetentionUntil?.toISOString()).toBe(retentionBefore);
    // Specifically: still Guest's 5 MB, not upgraded to Free's 100 MB.
    const snapshot = afterClaim!.sealedEntitlementSnapshot as Record<string, unknown>;
    expect(snapshot.planAtSeal).toBe('guest');
    expect(snapshot.storageAllowanceBytes).toBe(GUEST_STORAGE_ALLOWANCE_BYTES);

    const [session] = await db.select().from(guestSessions).where(eq(guestSessions.claimedByUserId, user.id));
    trackedSessionIds.push(session!.id);

    // The claimed capsule is now reachable as a normal owned capsule — the
    // account's Free entitlement governs *new* activity, not this one.
    const detail = await request(app)
      .get(`/v1/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${(await request(app).post('/v1/auth/login').send({ email, password: 'password123' })).body.tokens.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.capsule.id).toBe(capsuleId);
  });
});
