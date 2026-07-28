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
  return `favorites-test-${randomUUID()}@example.com`;
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
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
  };
}

describe('favorites module (T-17)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('toggles a capsule favorite on and off, reflected on the capsule and the favorite=true filter', async () => {
    const { accessToken } = await createUser();
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;

    const onRes = await authed(accessToken).put(`/v1/capsules/${capsuleId}/favorite`).send({ value: true });
    expect(onRes.status).toBe(204);

    const getRes = await authed(accessToken).get(`/v1/capsules/${capsuleId}`);
    expect(getRes.body.capsule.isFavorite).toBe(true);

    const listRes = await authed(accessToken).get('/v1/capsules?favorite=true');
    expect(listRes.body.data.map((c: { id: string }) => c.id)).toContain(capsuleId);

    const offRes = await authed(accessToken).put(`/v1/capsules/${capsuleId}/favorite`).send({ value: false });
    expect(offRes.status).toBe(204);
    const getAfter = await authed(accessToken).get(`/v1/capsules/${capsuleId}`);
    expect(getAfter.body.capsule.isFavorite).toBe(false);

    const listAfter = await authed(accessToken).get('/v1/capsules?favorite=true');
    expect(listAfter.body.data.map((c: { id: string }) => c.id)).not.toContain(capsuleId);
  });

  it('setting the same value twice is a harmless no-op', async () => {
    const { accessToken } = await createUser();
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;

    await authed(accessToken).put(`/v1/capsules/${capsuleId}/favorite`).send({ value: true });
    const res = await authed(accessToken).put(`/v1/capsules/${capsuleId}/favorite`).send({ value: true });
    expect(res.status).toBe(204);
  });

  it('404s favoriting another user’s capsule', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const capsuleId = (await authed(owner.accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;

    const res = await authed(stranger.accessToken).put(`/v1/capsules/${capsuleId}/favorite`).send({ value: true });
    expect(res.status).toBe(404);
  });
});
