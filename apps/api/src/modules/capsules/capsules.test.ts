import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsuleRecipients, capsules, capsuleVersions, entitlements, scheduledActions, users } from '../../db/schema/index.js';

const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `capsule-test-${randomUUID()}@example.com`;
}

// Capsule routes only require a valid access token (requireAuth doesn't
// check emailVerifiedAt), so signup alone is enough here — no need to walk
// through email verification (and doing so would mean reaching into
// modules/auth's internals from a different module, a boundary violation).
async function createVerifiedUser() {
  const app = createApp(db);
  const email = uniqueEmail();
  const signupRes = await request(app)
    .post('/v1/auth/signup')
    .send({
      email,
      password: 'correct-horse-battery-staple',
      displayName: 'Test User',
      masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
      recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
    });
  expect(signupRes.status).toBe(201);
  const userId = signupRes.body.user.id as string;
  createdUserIds.push(userId);

  return { app, userId, accessToken: signupRes.body.tokens.accessToken as string };
}

function authed(app: ReturnType<typeof createApp>, token: string) {
  return {
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
  };
}

function futureIso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

const MIN_5 = 5 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

describe('capsules module (T-08)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('creates a draft with a public_id', async () => {
    const { app, accessToken } = await createVerifiedUser();
    const res = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
    expect(res.status).toBe(201);
    expect(res.body.capsule.state).toBe('draft');
    expect(res.body.capsule.publicId).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  });

  it('lists own capsules without ciphertext fields', async () => {
    const { app, accessToken } = await createVerifiedUser();
    await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
    const res = await authed(app, accessToken).get('/v1/capsules');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).not.toHaveProperty('contentDocEnc');
    expect(res.body.data[0]).not.toHaveProperty('ownerKeyWrap');
  });

  it('round-trips base64 ciphertext through contentDocEnc/ownerKeyWrap bytea columns', async () => {
    const { app, accessToken } = await createVerifiedUser();
    const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
    const id = create.body.capsule.id;

    const contentDocEnc = Buffer.from('not actually ciphertext, just some bytes \x00\x01\xff').toString('base64');
    const ownerKeyWrap = Buffer.from('wrapped key bytes \x02\x03').toString('base64');

    const patchRes = await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ contentDocEnc, ownerKeyWrap });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.capsule.contentDocEnc).toBe(contentDocEnc);
    expect(patchRes.body.capsule.ownerKeyWrap).toBe(ownerKeyWrap);

    const getRes = await authed(app, accessToken).get(`/v1/capsules/${id}`);
    expect(getRes.body.capsule.contentDocEnc).toBe(contentDocEnc);
    expect(getRes.body.capsule.ownerKeyWrap).toBe(ownerKeyWrap);
  });

  it('rejects fetching or patching another user\'s capsule (404, not leaked)', async () => {
    const owner = await createVerifiedUser();
    const intruder = await createVerifiedUser();
    const create = await authed(owner.app, owner.accessToken).post('/v1/capsules').send({ type: 'personal' });
    const id = create.body.capsule.id;

    const getRes = await authed(intruder.app, intruder.accessToken).get(`/v1/capsules/${id}`);
    expect(getRes.status).toBe(404);

    const patchRes = await authed(intruder.app, intruder.accessToken).patch(`/v1/capsules/${id}`).send({ title: 'hijacked' });
    expect(patchRes.status).toBe(404);
  });

  describe('seal immutability (invariant 1)', () => {
    it('allows PATCH on a draft and records a version snapshot', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;

      const patchRes = await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ title: 'My letter' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.capsule.title).toBe('My letter');

      const versions = await db.select().from(capsuleVersions).where(eq(capsuleVersions.capsuleId, id));
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects PATCH once sealed with 409 capsule_sealed', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;

      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });
      const seal = await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
      expect(seal.status).toBe(200);
      expect(seal.body.capsule.state).toBe('sealed');

      const patchAfterSeal = await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ title: 'edited after seal' });
      expect(patchAfterSeal.status).toBe(409);
      expect(patchAfterSeal.body.error.code).toBe('capsule_sealed');
    });

    it('rejects sealing without unlockAt set', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      const seal = await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
      expect(seal.status).toBe(400);
    });

    it('rejects a PATCH that sets unlockAt less than 5 minutes out', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      const patchRes = await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(60_000) });
      expect(patchRes.status).toBe(422);
      expect(patchRes.body.error.code).toBe('unlock_in_past');
    });

    it('re-validates the unlock window at seal time, not just at PATCH time', async () => {
      // A draft can sit around for a while after its unlockAt was set — seal()
      // must independently re-check the 5-minute window rather than trusting
      // whatever PATCH validated when the field was originally written.
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });

      // Simulate time passing by backdating unlockAt directly in the DB —
      // bypasses PATCH's own validation, which is exactly the point.
      await db.update(capsules).set({ unlockAt: new Date(Date.now() + 60_000) }).where(eq(capsules.id, id));

      const seal = await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
      expect(seal.status).toBe(422);
      expect(seal.body.error.code).toBe('unlock_in_past');
    });

    it('creates a pending capsule_unlock scheduled_action on seal', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });
      await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});

      const actions = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, id));
      expect(actions.some((a) => a.kind === 'capsule_unlock' && a.state === 'pending')).toBe(true);
    });
  });

  describe('withdraw semantics (invariant 3)', () => {
    async function sealedCapsule(app: ReturnType<typeof createApp>, accessToken: string) {
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });
      await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
      return id;
    }

    it('withdraws a sealed capsule with no opens', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const id = await sealedCapsule(app, accessToken);
      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/withdraw`).send({});
      expect(res.status).toBe(200);
      expect(res.body.capsule.state).toBe('withdrawn');

      const actions = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, id));
      expect(actions.find((a) => a.kind === 'capsule_unlock')?.state).toBe('cancelled');
      expect(actions.some((a) => a.kind === 'trash_purge')).toBe(true);
    });

    it('rejects withdrawing a draft', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const res = await authed(app, accessToken).post(`/v1/capsules/${create.body.capsule.id}/withdraw`).send({});
      expect(res.status).toBe(409);
    });

    it('rejects withdrawing once a recipient has opened the capsule', async () => {
      const { app, accessToken, userId } = await createVerifiedUser();
      const id = await sealedCapsule(app, accessToken);
      await db.insert(capsuleRecipients).values({
        capsuleId: id,
        email: uniqueEmail(),
        accessTokenHash: randomUUID(),
        status: 'opened',
      });
      void userId;

      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/withdraw`).send({});
      expect(res.status).toBe(403);
    });

    it('rejects withdrawing an already-withdrawn capsule with capsule_withdrawn', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const id = await sealedCapsule(app, accessToken);
      await authed(app, accessToken).post(`/v1/capsules/${id}/withdraw`).send({});
      const second = await authed(app, accessToken).post(`/v1/capsules/${id}/withdraw`).send({});
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('capsule_withdrawn');
    });
  });

  describe('trash rules (invariant 3 & 4)', () => {
    it('trashes a plain draft', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      expect(res.status).toBe(200);
      expect(res.body.capsule.trashedAt).not.toBeNull();
    });

    it('rejects trashing a sealed capsule that has third-party recipients — must withdraw first', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });
      await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
      await db.insert(capsuleRecipients).values({ capsuleId: id, email: uniqueEmail(), accessTokenHash: randomUUID() });

      const trashRes = await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      expect(trashRes.status).toBe(403);

      await authed(app, accessToken).post(`/v1/capsules/${id}/withdraw`).send({});
      const trashAfterWithdraw = await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      expect(trashAfterWithdraw.status).toBe(200);
    });

    it('rejects trashing once any recipient has opened the capsule', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await db.insert(capsuleRecipients).values({
        capsuleId: id,
        email: uniqueEmail(),
        accessTokenHash: randomUUID(),
        status: 'opened',
      });
      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      expect(res.status).toBe(403);
    });

    it('rejects trashing a legacy capsule with active legacy config', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'legacy' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ legacyConfig: { trigger: 'date' } });

      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      expect(res.status).toBe(403);

      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ legacyConfig: null });
      const secondTry = await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      expect(secondTry.status).toBe(200);
    });

    it('restores a trashed capsule', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).post(`/v1/capsules/${id}/trash`).send({});
      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/restore`).send({});
      expect(res.status).toBe(200);
      expect(res.body.capsule.trashedAt).toBeNull();
    });
  });

  describe('extend-once (invariant: extend ≤30d, once)', () => {
    async function sealedCapsule(app: ReturnType<typeof createApp>, accessToken: string) {
      const unlockAt = futureIso(MIN_5 + 60_000);
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt });
      await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
      return { id, unlockAt };
    }

    it('extends once and updates the scheduled unlock action', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const { id, unlockAt } = await sealedCapsule(app, accessToken);
      const newUnlockAt = new Date(new Date(unlockAt).getTime() + DAY).toISOString();

      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/extend`).send({ newUnlockAt });
      expect(res.status).toBe(200);
      expect(res.body.capsule.extendedOnce).toBe(true);

      const actions = await db.select().from(scheduledActions).where(eq(scheduledActions.subjectId, id));
      const unlockAction = actions.find((a) => a.kind === 'capsule_unlock' && a.state === 'pending');
      expect(unlockAction?.runAt.toISOString()).toBe(newUnlockAt);
    });

    it('rejects extending a second time', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const { id, unlockAt } = await sealedCapsule(app, accessToken);
      const first = new Date(new Date(unlockAt).getTime() + DAY).toISOString();
      await authed(app, accessToken).post(`/v1/capsules/${id}/extend`).send({ newUnlockAt: first });

      const second = new Date(new Date(first).getTime() + DAY).toISOString();
      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/extend`).send({ newUnlockAt: second });
      expect(res.status).toBe(403);
    });

    it('rejects extending by more than 30 days', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const { id, unlockAt } = await sealedCapsule(app, accessToken);
      const tooFar = new Date(new Date(unlockAt).getTime() + 31 * DAY).toISOString();
      const res = await authed(app, accessToken).post(`/v1/capsules/${id}/extend`).send({ newUnlockAt: tooFar });
      expect(res.status).toBe(403);
    });

    it('rejects extending a draft (not yet sealed)', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const res = await authed(app, accessToken)
        .post(`/v1/capsules/${create.body.capsule.id}/extend`)
        .send({ newUnlockAt: futureIso(2 * DAY) });
      expect(res.status).toBe(409);
    });
  });

  describe('duplicate / archive / unarchive / activity', () => {
    it('duplicates a capsule into a new draft', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ title: 'Original' });

      const dup = await authed(app, accessToken).post(`/v1/capsules/${id}/duplicate`).send({});
      expect(dup.status).toBe(201);
      expect(dup.body.capsule.title).toBe('Original');
      expect(dup.body.capsule.id).not.toBe(id);
      expect(dup.body.capsule.state).toBe('draft');
    });

    it('archives and unarchives', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;

      const archive = await authed(app, accessToken).post(`/v1/capsules/${id}/archive`).send({});
      expect(archive.status).toBe(200);
      expect(archive.body.capsule.archivedAt).not.toBeNull();

      const unarchive = await authed(app, accessToken).post(`/v1/capsules/${id}/unarchive`).send({});
      expect(unarchive.status).toBe(200);
      expect(unarchive.body.capsule.archivedAt).toBeNull();
    });

    it('records activity for state transitions', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      await authed(app, accessToken).post(`/v1/capsules/${id}/archive`).send({});

      const activity = await authed(app, accessToken).get(`/v1/capsules/${id}/activity`);
      expect(activity.status).toBe(200);
      expect(activity.body.data.some((e: { action: string }) => e.action === 'capsule.archived')).toBe(true);
      expect(activity.body.data.some((e: { action: string }) => e.action === 'capsule.created')).toBe(true);
    });
  });

  describe('seals validation', () => {
    it('rejects a legacy capsule with a place seal', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'legacy' });
      const id = create.body.capsule.id;
      const res = await authed(app, accessToken)
        .patch(`/v1/capsules/${id}`)
        .send({ seals: [{ type: 'place', config: { lat: 1, lng: 1, radiusM: 100, name: 'Home' } }] });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate seal types', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      const res = await authed(app, accessToken)
        .patch(`/v1/capsules/${id}`)
        .send({
          seals: [
            { type: 'passphrase', config: { hint: 'a', wrappedKeyB64: 'x' } },
            { type: 'passphrase', config: { hint: 'b', wrappedKeyB64: 'y' } },
          ],
        });
      expect(res.status).toBe(400);
    });

    it('enforces the free-plan limit of 1 place-or-passphrase seal per capsule', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      const res = await authed(app, accessToken)
        .patch(`/v1/capsules/${id}`)
        .send({
          seals: [
            { type: 'place', config: { lat: 1, lng: 1, radiusM: 100, name: 'Home' } },
            { type: 'passphrase', config: { hint: 'a', wrappedKeyB64: 'x' } },
          ],
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('quota_exceeded');
    });

    it('syncs passphraseHint from the seals array', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id = create.body.capsule.id;
      const res = await authed(app, accessToken)
        .patch(`/v1/capsules/${id}`)
        .send({ seals: [{ type: 'passphrase', config: { hint: 'our song', wrappedKeyB64: 'abc' } }] });
      expect(res.status).toBe(200);
      expect(res.body.capsule.passphraseHint).toBe('our song');
    });
  });

  describe('plan limits', () => {
    it('rejects sealing a 6th capsule on the free plan (active-sealed limit of 5)', async () => {
      const { app, accessToken } = await createVerifiedUser();
      for (let i = 0; i < 5; i++) {
        const create = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
        const id = create.body.capsule.id;
        await authed(app, accessToken).patch(`/v1/capsules/${id}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });
        const seal = await authed(app, accessToken).post(`/v1/capsules/${id}/seal`).send({});
        expect(seal.status).toBe(200);
      }

      const create6 = await authed(app, accessToken).post('/v1/capsules').send({ type: 'personal' });
      const id6 = create6.body.capsule.id;
      await authed(app, accessToken).patch(`/v1/capsules/${id6}`).send({ unlockAt: futureIso(MIN_5 + 60_000) });
      const seal6 = await authed(app, accessToken).post(`/v1/capsules/${id6}/seal`).send({});
      expect(seal6.status).toBe(403);
      expect(seal6.body.error.code).toBe('quota_exceeded');
    });
  });
});
