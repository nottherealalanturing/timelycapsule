import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { entitlements, users } from '../../db/schema/index.js';

const app = createApp(db);
const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `collections-test-${randomUUID()}@example.com`;
}

async function createUser() {
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
  return { userId, accessToken: signupRes.body.tokens.accessToken as string };
}

function authed(token: string) {
  return {
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

async function createCapsule(token: string): Promise<string> {
  const res = await authed(token).post('/v1/capsules').send({ type: 'personal' });
  return res.body.capsule.id as string;
}

describe('collections module (T-17)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('creates, lists, renames, and deletes a collection — deleting keeps the capsules', async () => {
    const { accessToken } = await createUser();
    const capsuleId = await createCapsule(accessToken);

    const createRes = await authed(accessToken).post('/v1/collections').send({ name: 'Family Letters' });
    expect(createRes.status).toBe(201);
    const collectionId = createRes.body.collection.id as string;
    expect(createRes.body.collection.capsuleCount).toBe(0);

    await authed(accessToken).post(`/v1/collections/${collectionId}/items`).send({ capsuleId });

    const listRes = await authed(accessToken).get('/v1/collections');
    expect(listRes.body.data.find((c: { id: string }) => c.id === collectionId).capsuleCount).toBe(1);

    const patchRes = await authed(accessToken).patch(`/v1/collections/${collectionId}`).send({ name: 'Renamed' });
    expect(patchRes.body.collection.name).toBe('Renamed');

    const deleteRes = await authed(accessToken).delete(`/v1/collections/${collectionId}`);
    expect(deleteRes.status).toBe(204);

    const capsuleStillThere = await authed(accessToken).get(`/v1/capsules/${capsuleId}`);
    expect(capsuleStillThere.status).toBe(200);
  });

  it('add/remove items and filters the capsule timeline by collectionId', async () => {
    const { accessToken } = await createUser();
    const capsuleA = await createCapsule(accessToken);
    const capsuleB = await createCapsule(accessToken);
    const collectionId = (await authed(accessToken).post('/v1/collections').send({ name: 'Trip' })).body.collection.id as string;

    await authed(accessToken).post(`/v1/collections/${collectionId}/items`).send({ capsuleId: capsuleA });
    const filtered = await authed(accessToken).get(`/v1/capsules?collectionId=${collectionId}`);
    expect(filtered.body.data.map((c: { id: string }) => c.id)).toEqual([capsuleA]);
    expect(filtered.body.data.map((c: { id: string }) => c.id)).not.toContain(capsuleB);

    await authed(accessToken).delete(`/v1/collections/${collectionId}/items/${capsuleA}`);
    const afterRemove = await authed(accessToken).get(`/v1/capsules?collectionId=${collectionId}`);
    expect(afterRemove.body.data).toEqual([]);
  });

  it('still shows an archived capsule inside its collection, but not once trashed', async () => {
    const { accessToken } = await createUser();
    const capsuleId = await createCapsule(accessToken);
    const collectionId = (await authed(accessToken).post('/v1/collections').send({ name: 'Keepsakes' })).body.collection.id as string;
    await authed(accessToken).post(`/v1/collections/${collectionId}/items`).send({ capsuleId });

    await authed(accessToken).post(`/v1/capsules/${capsuleId}/archive`).send({});
    const afterArchive = await authed(accessToken).get(`/v1/capsules?collectionId=${collectionId}`);
    expect(afterArchive.body.data.map((c: { id: string }) => c.id)).toEqual([capsuleId]);

    await authed(accessToken).post(`/v1/capsules/${capsuleId}/unarchive`).send({});
    await authed(accessToken).post(`/v1/capsules/${capsuleId}/trash`).send({});
    const afterTrash = await authed(accessToken).get(`/v1/capsules?collectionId=${collectionId}`);
    expect(afterTrash.body.data).toEqual([]);
  });

  it('reorders items and rejects a mismatched set', async () => {
    const { accessToken } = await createUser();
    const capsuleA = await createCapsule(accessToken);
    const capsuleB = await createCapsule(accessToken);
    const collectionId = (await authed(accessToken).post('/v1/collections').send({ name: 'Ordered' })).body.collection.id as string;
    await authed(accessToken).post(`/v1/collections/${collectionId}/items`).send({ capsuleId: capsuleA });
    await authed(accessToken).post(`/v1/collections/${collectionId}/items`).send({ capsuleId: capsuleB });

    const reorderRes = await authed(accessToken).put(`/v1/collections/${collectionId}/items`).send({ capsuleIds: [capsuleB, capsuleA] });
    expect(reorderRes.status).toBe(204);

    const mismatchRes = await authed(accessToken).put(`/v1/collections/${collectionId}/items`).send({ capsuleIds: [capsuleA] });
    expect(mismatchRes.status).toBe(400);
  });

  it('404s operating on another user’s collection', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const collectionId = (await authed(owner.accessToken).post('/v1/collections').send({ name: 'Private' })).body.collection.id as string;

    const res = await authed(stranger.accessToken).patch(`/v1/collections/${collectionId}`).send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });
});
