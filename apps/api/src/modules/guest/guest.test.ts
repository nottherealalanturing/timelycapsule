import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsules, guestSessions, scheduledActions, users } from '../../db/schema/index.js';
import { signup } from '../auth/index.js';

const app = createApp(db);
const trackedUserIds: string[] = [];
const trackedCapsuleIds: string[] = [];
const trackedSessionIds: string[] = [];

const meta = { platform: 'web' as const, ip: '127.0.0.1', userAgent: 'vitest', deviceName: null };

async function createGuestSession() {
  const res = await request(app).post('/v1/guest/sessions').expect(201);
  return res.body.guestToken as string;
}

async function createSealedGuestCapsule(guestToken: string, unlockAt = new Date(Date.now() + 10 * 60 * 1000)) {
  const created = await request(app)
    .post('/v1/guest/capsules')
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ title: 'A note to the future' })
    .expect(201);

  await request(app)
    .patch(`/v1/guest/capsules/${created.body.id}`)
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ contentDocEnc: Buffer.from('fake-ciphertext').toString('base64'), unlockAt: unlockAt.toISOString() })
    .expect(200);

  const sealed = await request(app).post(`/v1/guest/capsules/${created.body.id}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(200);

  return { capsuleId: created.body.id as string, recipientToken: created.body.recipientToken as string, sealed: sealed.body };
}

describe('guest mode (T-15b)', () => {
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

  it('POST /guest/sessions issues a usable guest token', async () => {
    const token = await createGuestSession();
    expect(token).toHaveLength(26);
  });

  it('creates, patches, and seals a guest capsule; capsule_unlock is scheduled', async () => {
    const guestToken = await createGuestSession();
    const { capsuleId, recipientToken, sealed } = await createSealedGuestCapsule(guestToken);
    trackedCapsuleIds.push(capsuleId);

    expect(recipientToken).toHaveLength(26);
    expect(sealed.state).toBe('sealed');

    const [action] = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, capsuleId));
    expect(action?.kind).toBe('capsule_unlock');
  });

  it('rejects a second capsule for the same session (1-capsule cap)', async () => {
    const guestToken = await createGuestSession();
    const first = await request(app).post('/v1/guest/capsules').set('Authorization', `Bearer ${guestToken}`).send({}).expect(201);
    trackedCapsuleIds.push(first.body.id);

    const second = await request(app).post('/v1/guest/capsules').set('Authorization', `Bearer ${guestToken}`).send({}).expect(409);
    expect(second.body.error.code).toBe('guest_capsule_limit');
  });

  it('rejects sealing with an unlock time beyond +1 year', async () => {
    const guestToken = await createGuestSession();
    const created = await request(app).post('/v1/guest/capsules').set('Authorization', `Bearer ${guestToken}`).send({}).expect(201);
    trackedCapsuleIds.push(created.body.id);

    await request(app)
      .patch(`/v1/guest/capsules/${created.body.id}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        contentDocEnc: Buffer.from('x').toString('base64'),
        unlockAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(200);

    const res = await request(app).post(`/v1/guest/capsules/${created.body.id}/seal`).set('Authorization', `Bearer ${guestToken}`).expect(422);
    expect(res.body.error.code).toBe('unlock_in_past');
  });

  it('rejects an invalid or already-claimed guest token', async () => {
    const res = await request(app).get('/v1/guest/capsules/00000000-0000-0000-0000-000000000000').set('Authorization', 'Bearer notarealtoken').expect(401);
    expect(res.body.error.code).toBe('guest_session_invalid');
  });

  it('signup with a guestToken claims the guest capsule into the new account', async () => {
    const guestToken = await createGuestSession();
    const { capsuleId } = await createSealedGuestCapsule(guestToken);
    trackedCapsuleIds.push(capsuleId);

    const email = `guest-claim-${randomUUID()}@example.com`;
    const { user } = await signup(
      db,
      { email, password: 'password123', displayName: 'Claimed Guest', masterKeyWrap: 'wrap', recoveryKeyWrap: 'recovery', guestToken },
      meta,
    );
    trackedUserIds.push(user.id);

    const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    expect(capsule?.ownerId).toBe(user.id);

    const [session] = await db.select().from(guestSessions).where(eq(guestSessions.claimedByUserId, user.id));
    trackedSessionIds.push(session!.id);
    expect(session?.claimedAt).not.toBeNull();

    // The now-claimed session is burned — reusing its token must fail.
    const res = await request(app).get(`/v1/guest/capsules/${capsuleId}`).set('Authorization', `Bearer ${guestToken}`).expect(401);
    expect(res.body.error.code).toBe('guest_session_invalid');
  });

  it('an unconverted guest capsule still unlocks on schedule (T-13 pipeline reuse)', async () => {
    const guestToken = await createGuestSession();
    const { capsuleId } = await createSealedGuestCapsule(guestToken, new Date(Date.now() + 6 * 60 * 1000));
    trackedCapsuleIds.push(capsuleId);

    const { HANDLERS } = await import('../scheduler/index.js');
    const { systemClock } = await import('../../lib/clock.js');
    await HANDLERS.capsule_unlock({ db, clock: systemClock, subjectId: capsuleId });

    const [capsule] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    expect(capsule?.state).toBe('unlocked');
    expect(capsule?.ownerId).toBeNull();
  });
});
