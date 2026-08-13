import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsuleReplies, capsuleRecipients, capsules, mediaItems, scheduledActions, users } from '../../db/schema/index.js';
import { generateAccessToken, hashAccessToken } from '../recipients/index.js';
import { getStorageAdapter } from '../media/index.js';
import { HANDLERS } from '../scheduler/index.js';
import { systemClock } from '../../lib/clock.js';
import { expireCapsule, scheduleCapsuleExpiry } from './index.js';

const app = createApp(db);
const trackedUserIds: string[] = [];
const trackedCapsuleIds: string[] = [];

async function createOwner() {
  const [owner] = await db
    .insert(users)
    .values({ email: `expiry-owner-${randomUUID()}@example.com`, displayName: 'Expiry Owner', status: 'active' })
    .returning();
  trackedUserIds.push(owner!.id);
  return owner!;
}

/**
 * Builds an already-`unlocked`, `expiry_strict` capsule directly (matching
 * `reveal.test.ts`'s own `createRecipientCapsule` convention) — destruction
 * only ever needs to reason about a capsule already past unlock, and going
 * through the full compose→seal→wait→unlock cycle for every test here would
 * test M0/M4's own machinery a second time rather than this milestone's.
 */
async function createUnlockedCapsule(overrides: Partial<typeof capsules.$inferInsert> = {}) {
  const owner = await createOwner();
  const [capsule] = await db
    .insert(capsules)
    .values({
      ownerId: owner.id,
      type: 'personal',
      publicId: randomUUID().slice(0, 8).toUpperCase(),
      state: 'unlocked',
      unlockAt: new Date(Date.now() - 60_000),
      title: 'One reading only test',
      contentDocEnc: Buffer.from('fake-letter-ciphertext'),
      expiryStrict: true,
      expiresAfter: '0 seconds',
      ...overrides,
    })
    .returning();
  trackedCapsuleIds.push(capsule!.id);

  const rawToken = generateAccessToken();
  const [recipient] = await db
    .insert(capsuleRecipients)
    .values({
      capsuleId: capsule!.id,
      email: `expiry-recipient-${randomUUID()}@example.com`,
      displayName: 'Expiry Recipient',
      accessTokenHash: hashAccessToken(rawToken),
      status: 'added',
    })
    .returning();

  return { owner, capsule: capsule!, recipient: recipient!, rawToken };
}

/** A real media row with a real (fake-adapter) object behind its storage key, so deletion can be genuinely verified. */
async function attachRealMedia(capsuleId: string, name = 'photo.jpg') {
  const adapter = getStorageAdapter();
  const storageKey = `media/${capsuleId}/${randomUUID()}/${name}`;
  await adapter.putObject(storageKey, Buffer.from('fake-encrypted-bytes'), 'application/octet-stream');
  const [row] = await db
    .insert(mediaItems)
    .values({ capsuleId, kind: 'image', storageKey, originalName: name, mime: 'image/jpeg', sizeBytes: 21, status: 'ready', position: 0 })
    .returning();
  await db.update(capsules).set({ sizeBytes: 21 }).where(eq(capsules.id, capsuleId));
  return { mediaId: row!.id, storageKey };
}

async function attachReply(capsuleId: string, recipientId: string) {
  const [row] = await db
    .insert(capsuleReplies)
    .values({ capsuleId, recipientId, author: 'recipient', bodyEnc: 'fake-iv-and-ciphertext' })
    .returning();
  return row!.id;
}

describe('capsule expiry — "one reading only" (post-M5 correctness)', () => {
  afterAll(async () => {
    for (const id of trackedCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of trackedUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  // --- 1/2/3: seal-time persistence + correct/no scheduling -------------

  it('sealing with "one reading only" persists expiry_strict/expires_after through to the sealed row (DoD 1)', async () => {
    const res = await request(app).post('/v1/auth/signup').send({
      email: `expiry-seal-${randomUUID()}@example.com`,
      password: 'correct-horse-battery-staple',
      displayName: 'Expiry Seal Test',
      masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
      recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
    });
    expect(res.status).toBe(201);
    trackedUserIds.push(res.body.user.id);
    const token = res.body.tokens.accessToken as string;

    const created = await request(app).post('/v1/capsules').set('Authorization', `Bearer ${token}`).send({ type: 'personal' });
    trackedCapsuleIds.push(created.body.capsule.id);

    const patched = await request(app)
      .patch(`/v1/capsules/${created.body.capsule.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentDocEnc: Buffer.from('letter').toString('base64'),
        unlockAt: new Date(Date.now() + 6 * 60_000).toISOString(),
        expiresAfter: '0 seconds',
        expiryStrict: true,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.capsule.expiryStrict).toBe(true);

    const sealed = await request(app).post(`/v1/capsules/${created.body.capsule.id}/seal`).set('Authorization', `Bearer ${token}`);
    expect(sealed.status).toBe(200);
    expect(sealed.body.capsule.expiryStrict).toBe(true);
    expect(sealed.body.capsule.expiresAfter).toBe('00:00:00');
  });

  it('confirming a read on a strict, unlocked capsule schedules exactly one capsule_expire action (DoD 2)', async () => {
    const { capsule, rawToken } = await createUnlockedCapsule();
    const res = await request(app).post(`/v1/r/${rawToken}/confirm-read`);
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.subjectId, capsule.id), eq(scheduledActions.kind, 'capsule_expire')));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe('pending');
  });

  it('a normal (non-strict) capsule never schedules capsule_expire, however the reveal is confirmed (DoD 3)', async () => {
    const { capsule, rawToken } = await createUnlockedCapsule({ expiryStrict: false, expiresAfter: null });

    const getRes = await request(app).get(`/v1/r/${rawToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('unlocked');

    const confirmRes = await request(app).post(`/v1/r/${rawToken}/confirm-read`);
    expect(confirmRes.status).toBe(204);

    const rows = await db.select().from(scheduledActions).where(and(eq(scheduledActions.subjectId, capsule.id), eq(scheduledActions.kind, 'capsule_expire')));
    expect(rows).toHaveLength(0);

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    expect(row!.state).toBe('unlocked');
    expect(row!.contentDocEnc).not.toBeNull();
  });

  // --- 4: merely opening the URL is not "reading" ------------------------

  it('merely GETting the reveal URL does not schedule destruction — only the confirmed-read call does (DoD 4)', async () => {
    const { capsule, rawToken } = await createUnlockedCapsule();

    const getRes = await request(app).get(`/v1/r/${rawToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('unlocked');
    expect(getRes.body.contentDocEnc).toBeTruthy();

    // The GET alone — the equivalent of a broken link or a bot fetching the
    // URL without ever decrypting anything — must not have scheduled
    // anything destructive.
    const rowsAfterGet = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.subjectId, capsule.id), eq(scheduledActions.kind, 'capsule_expire')));
    expect(rowsAfterGet).toHaveLength(0);

    const [stillAlive] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    expect(stillAlive!.state).toBe('unlocked');
    expect(stillAlive!.contentDocEnc).not.toBeNull();
  });

  // --- 5/6/7: the actual destruction ---------------------------------

  it('destroys the capsule, deletes real media from storage, and deletes replies (DoD 5/6/7)', async () => {
    const { capsule, recipient } = await createUnlockedCapsule();
    const { storageKey } = await attachRealMedia(capsule.id);
    const replyId = await attachReply(capsule.id, recipient.id);

    const adapter = getStorageAdapter();
    expect(await adapter.headObject(storageKey)).not.toBeNull();

    await scheduleCapsuleExpiry(db, capsule);
    await expireCapsule(db, capsule.id);

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    expect(row!.state).toBe('expired');
    expect(row!.expiredAt).toBeTruthy();
    expect(row!.contentDocEnc).toBeNull();
    expect(row!.sizeBytes).toBe(0);

    const mediaRows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsule.id));
    expect(mediaRows).toHaveLength(0);
    expect(await adapter.headObject(storageKey)).toBeNull();

    const replyRows = await db.select().from(capsuleReplies).where(eq(capsuleReplies.id, replyId));
    expect(replyRows).toHaveLength(0);

    // The envelope survives — title and dates are not the letter.
    expect(row!.title).toBe('One reading only test');
  });

  // --- 8/9: neither side can reopen it ------------------------------

  it('neither the owner nor the recipient can access the destroyed content (DoD 8/9)', async () => {
    const { owner, capsule, rawToken } = await createUnlockedCapsule();
    await attachRealMedia(capsule.id);
    await expireCapsule(db, capsule.id);

    // Recipient: the reveal short-circuits to the expired tombstone before
    // any content is ever assembled — same shape as `withdrawn`.
    const revealRes = await request(app).get(`/v1/r/${rawToken}`);
    expect(revealRes.status).toBe(200);
    expect(revealRes.body).toEqual({ status: 'expired' });

    // Owner: nothing to log in with in this suite, so the row is read
    // directly — `contentDocEnc` is genuinely gone, which is what makes the
    // owner's own page unable to reopen it (verified separately via the
    // owner-facing service, not just the DB row).
    const { getCapsule } = await import('./service.js');
    const capsuleView = await getCapsule(db, owner.id, capsule.id);
    expect(capsuleView.contentDocEnc).toBeNull();
    expect(capsuleView.state).toBe('expired');
  });

  // --- 10/12: idempotency / cannot run twice destructively --------------

  it('running expireCapsule twice is safe — the second run is a pure no-op (DoD 10)', async () => {
    const { capsule } = await createUnlockedCapsule();
    const { storageKey } = await attachRealMedia(capsule.id);

    await expireCapsule(db, capsule.id);
    const [firstPass] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));

    await expireCapsule(db, capsule.id); // must not throw, must not double-anything
    const [secondPass] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));

    expect(secondPass!.expiredAt?.toISOString()).toBe(firstPass!.expiredAt?.toISOString());
    expect(secondPass!.state).toBe('expired');
    const adapter = getStorageAdapter();
    expect(await adapter.headObject(storageKey)).toBeNull();
  });

  it('two confirmed-read calls schedule only one capsule_expire row, never two (DoD 12)', async () => {
    const { capsule, rawToken } = await createUnlockedCapsule();

    const [first, second] = await Promise.all([
      request(app).post(`/v1/r/${rawToken}/confirm-read`),
      request(app).post(`/v1/r/${rawToken}/confirm-read`),
    ]);
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const rows = await db.select().from(scheduledActions).where(and(eq(scheduledActions.subjectId, capsule.id), eq(scheduledActions.kind, 'capsule_expire')));
    expect(rows).toHaveLength(1);
  });

  // --- 11: a failed blob delete must not falsely mark destruction complete --

  it('a failed storage delete leaves the capsule fully alive — no partial destruction (DoD 11)', async () => {
    const { capsule, recipient } = await createUnlockedCapsule();
    const { storageKey } = await attachRealMedia(capsule.id);
    const replyId = await attachReply(capsule.id, recipient.id);

    const adapter = getStorageAdapter();
    const originalDelete = adapter.deleteObject.bind(adapter);
    adapter.deleteObject = async () => {
      throw new Error('simulated R2 outage');
    };

    await expect(expireCapsule(db, capsule.id)).rejects.toThrow(/incomplete/i);

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    // Nothing in the DB moved — not the state, not the content, not the size.
    expect(row!.state).toBe('unlocked');
    expect(row!.contentDocEnc).not.toBeNull();
    expect(row!.expiredAt).toBeNull();

    const mediaRows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsule.id));
    expect(mediaRows).toHaveLength(1);
    const replyRows = await db.select().from(capsuleReplies).where(eq(capsuleReplies.id, replyId));
    expect(replyRows).toHaveLength(1);

    // Restored, then a genuine retry succeeds end to end — the same object
    // that failed once deletes cleanly the second time.
    adapter.deleteObject = originalDelete;
    await expireCapsule(db, capsule.id);
    const [after] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    expect(after!.state).toBe('expired');
    expect(await adapter.headObject(storageKey)).toBeNull();
  });

  // --- 13: withdrawal before reading -----------------------------------

  it('a sealed strict capsule that is withdrawn before unlock can never reach the read/expire path (DoD 13)', async () => {
    const owner = await createOwner();
    const [capsule] = await db
      .insert(capsules)
      .values({
        ownerId: owner.id,
        type: 'personal',
        publicId: randomUUID().slice(0, 8).toUpperCase(),
        state: 'sealed',
        unlockAt: new Date(Date.now() + 60_000),
        title: 'Withdrawn before reading',
        contentDocEnc: Buffer.from('fake-letter-ciphertext'),
        expiryStrict: true,
        expiresAfter: '0 seconds',
      })
      .returning();
    trackedCapsuleIds.push(capsule!.id);

    const rawToken = generateAccessToken();
    await db.insert(capsuleRecipients).values({
      capsuleId: capsule!.id,
      email: `expiry-withdraw-${randomUUID()}@example.com`,
      accessTokenHash: hashAccessToken(rawToken),
      status: 'added',
    });

    const { withdrawCapsule } = await import('./lifecycle.js');
    await withdrawCapsule(db, owner.id, capsule!.id);

    // The recipient's link never reaches unlocked content at all.
    const revealRes = await request(app).get(`/v1/r/${rawToken}`);
    expect(revealRes.body).toEqual({ status: 'withdrawn' });

    // A confirm-read call against a withdrawn capsule is a harmless no-op —
    // `scheduleCapsuleExpiry` only ever acts on `state === 'unlocked'`.
    const confirmRes = await request(app).post(`/v1/r/${rawToken}/confirm-read`);
    expect(confirmRes.status).toBe(204);

    const rows = await db.select().from(scheduledActions).where(and(eq(scheduledActions.subjectId, capsule!.id), eq(scheduledActions.kind, 'capsule_expire')));
    expect(rows).toHaveLength(0);
  });

  // --- 14: extend cannot create an invalid expiry relationship -----------

  it('extending a sealed strict capsule leaves expiry_strict/expires_after untouched, and reading still destroys it correctly (DoD 14)', async () => {
    const owner = await createOwner();
    const originalUnlockAt = new Date(Date.now() + 6 * 60_000);
    const [capsule] = await db
      .insert(capsules)
      .values({
        ownerId: owner.id,
        type: 'personal',
        publicId: randomUUID().slice(0, 8).toUpperCase(),
        state: 'sealed',
        unlockAt: originalUnlockAt,
        title: 'Extend then read',
        contentDocEnc: Buffer.from('fake-letter-ciphertext'),
        expiryStrict: true,
        expiresAfter: '0 seconds',
      })
      .returning();
    trackedCapsuleIds.push(capsule!.id);

    const rawToken = generateAccessToken();
    await db.insert(capsuleRecipients).values({
      capsuleId: capsule!.id,
      email: `expiry-extend-${randomUUID()}@example.com`,
      accessTokenHash: hashAccessToken(rawToken),
      status: 'added',
    });

    const { extendCapsule } = await import('./lifecycle.js');
    const newUnlockAt = new Date(originalUnlockAt.getTime() + 20 * 24 * 60 * 60 * 1000); // +20 days, within the 30-day cap
    await extendCapsule(db, owner.id, capsule!.id, { newUnlockAt: newUnlockAt.toISOString() });

    const [afterExtend] = await db.select().from(capsules).where(eq(capsules.id, capsule!.id));
    expect(afterExtend!.expiryStrict).toBe(true);
    expect(afterExtend!.expiresAfter).toBe('00:00:00');
    expect(afterExtend!.unlockAt?.toISOString()).toBe(newUnlockAt.toISOString());

    // Unlock via the real handler, then confirm the read still destroys it
    // exactly as it would have without the extend.
    await db.update(capsules).set({ state: 'unlocked' }).where(eq(capsules.id, capsule!.id));
    const confirmRes = await request(app).post(`/v1/r/${rawToken}/confirm-read`);
    expect(confirmRes.status).toBe(204);

    await HANDLERS.capsule_expire({ db, clock: systemClock, subjectId: capsule!.id });
    const [afterExpire] = await db.select().from(capsules).where(eq(capsules.id, capsule!.id));
    expect(afterExpire!.state).toBe('expired');
  });

  // --- The real handler, end to end, exactly as the promoter would run it --

  it('the registered capsule_expire handler destroys the capsule via the real dispatch path', async () => {
    const { capsule, rawToken } = await createUnlockedCapsule();
    await attachRealMedia(capsule.id);

    await request(app).post(`/v1/r/${rawToken}/confirm-read`).expect(204);
    const [scheduled] = await db
      .select()
      .from(scheduledActions)
      .where(and(eq(scheduledActions.subjectId, capsule.id), eq(scheduledActions.kind, 'capsule_expire')));
    expect(scheduled).toBeTruthy();

    await HANDLERS.capsule_expire({ db, clock: systemClock, subjectId: capsule.id });

    const [row] = await db.select().from(capsules).where(eq(capsules.id, capsule.id));
    expect(row!.state).toBe('expired');
  });
});
