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
  return `tags-test-${randomUUID()}@example.com`;
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

describe('tags module (T-17)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('creates, lists, renames, and deletes a tag', async () => {
    const { accessToken } = await createUser();

    const createRes = await authed(accessToken).post('/v1/tags').send({ name: 'Milestones' });
    expect(createRes.status).toBe(201);
    const tagId = createRes.body.tag.id as string;

    const listRes = await authed(accessToken).get('/v1/tags');
    expect(listRes.body.data).toHaveLength(1);

    const patchRes = await authed(accessToken).patch(`/v1/tags/${tagId}`).send({ name: 'Big Milestones' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.tag.name).toBe('Big Milestones');

    const deleteRes = await authed(accessToken).delete(`/v1/tags/${tagId}`);
    expect(deleteRes.status).toBe(204);
    expect((await authed(accessToken).get('/v1/tags')).body.data).toHaveLength(0);
  });

  it('rejects a duplicate tag name for the same user', async () => {
    const { accessToken } = await createUser();
    await authed(accessToken).post('/v1/tags').send({ name: 'Family' });

    const res = await authed(accessToken).post('/v1/tags').send({ name: 'Family' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('tag_already_exists');
  });

  it('404s renaming another user’s tag', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const createRes = await authed(owner.accessToken).post('/v1/tags').send({ name: 'Private' });
    const tagId = createRes.body.tag.id as string;

    const res = await authed(stranger.accessToken).patch(`/v1/tags/${tagId}`).send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('PUT /capsules/:id/tags replaces the capsule’s tag set and reflects on the capsule', async () => {
    const { accessToken } = await createUser();
    const tag1 = (await authed(accessToken).post('/v1/tags').send({ name: 'Tag One' })).body.tag.id as string;
    const tag2 = (await authed(accessToken).post('/v1/tags').send({ name: 'Tag Two' })).body.tag.id as string;
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;

    const putRes = await authed(accessToken).put(`/v1/capsules/${capsuleId}/tags`).send({ tagIds: [tag1, tag2] });
    expect(putRes.status).toBe(204);

    const getRes = await authed(accessToken).get(`/v1/capsules/${capsuleId}`);
    expect(getRes.body.capsule.tagIds.sort()).toEqual([tag1, tag2].sort());

    const replaceRes = await authed(accessToken).put(`/v1/capsules/${capsuleId}/tags`).send({ tagIds: [tag1] });
    expect(replaceRes.status).toBe(204);
    const getAfter = await authed(accessToken).get(`/v1/capsules/${capsuleId}`);
    expect(getAfter.body.capsule.tagIds).toEqual([tag1]);
  });

  it('404s tagging a capsule with another user’s tag id', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const strangerTag = (await authed(stranger.accessToken).post('/v1/tags').send({ name: 'Not Yours' })).body.tag.id as string;
    const capsuleId = (await authed(owner.accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;

    const res = await authed(owner.accessToken).put(`/v1/capsules/${capsuleId}/tags`).send({ tagIds: [strangerTag] });
    expect(res.status).toBe(404);
  });
});
