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

function uniqueEmail(prefix = 'search-test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
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
  };
}

describe('search module (T-17)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('matches a capsule by title', async () => {
    const { accessToken } = await createUser();
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;
    await authed(accessToken).patch(`/v1/capsules/${capsuleId}`).send({ title: 'Rocket Ship Diary' });

    const res = await authed(accessToken).get('/v1/search?q=rocket');
    expect(res.status).toBe(200);
    const match = res.body.data.find((r: { kind: string; id: string }) => r.kind === 'capsule' && r.id === capsuleId);
    expect(match).toBeTruthy();
    expect(match.matchedOn).toBe('title');
  });

  it('matches a capsule by tag name and by recipient, but never by content-adjacent fields', async () => {
    const { accessToken } = await createUser();

    const tagId = (await authed(accessToken).post('/v1/tags').send({ name: 'Spelunking' })).body.tag.id as string;
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;
    await authed(accessToken)
      .patch(`/v1/capsules/${capsuleId}`)
      .send({ title: 'Untitled', teaser: 'a very secret confession nobody should be able to search for' });
    await authed(accessToken).put(`/v1/capsules/${capsuleId}/tags`).send({ tagIds: [tagId] });

    const tagRes = await authed(accessToken).get('/v1/search?q=spelunking');
    const tagMatch = tagRes.body.data.find((r: { kind: string; id: string }) => r.kind === 'capsule' && r.id === capsuleId);
    expect(tagMatch?.matchedOn).toBe('tag');

    const recipientCapsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;
    await authed(accessToken)
      .post(`/v1/capsules/${recipientCapsuleId}/recipients`)
      .send({ email: uniqueEmail('recip'), displayName: 'Zephyrine Okafor' });
    const recipientRes = await authed(accessToken).get('/v1/search?q=zephyrine');
    const recipientMatch = recipientRes.body.data.find(
      (r: { kind: string; id: string }) => r.kind === 'capsule' && r.id === recipientCapsuleId,
    );
    expect(recipientMatch?.matchedOn).toBe('recipient');

    // DoD: content-adjacent text (teaser here stands in for anything not title/tag/recipient) never matches.
    const teaserRes = await authed(accessToken).get('/v1/search?q=confession');
    expect(teaserRes.body.data.find((r: { id: string }) => r.id === capsuleId)).toBeUndefined();
  });

  it('matches a contact (person) and a collection', async () => {
    const { accessToken } = await createUser();
    await authed(accessToken).post('/v1/contacts').send({ name: 'Odalys Vance' });
    await authed(accessToken).post('/v1/collections').send({ name: 'Anniversary Archive' });

    const personRes = await authed(accessToken).get('/v1/search?q=odalys');
    expect(personRes.body.data.some((r: { kind: string }) => r.kind === 'person')).toBe(true);

    const collectionRes = await authed(accessToken).get('/v1/search?q=anniversary');
    expect(collectionRes.body.data.some((r: { kind: string }) => r.kind === 'collection')).toBe(true);
  });

  it('never includes a content field anywhere in the response shape (schema-level guarantee)', async () => {
    const { accessToken } = await createUser();
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;
    await authed(accessToken).patch(`/v1/capsules/${capsuleId}`).send({ title: 'Contentless Search Probe' });

    const res = await authed(accessToken).get('/v1/search?q=contentless');
    const match = res.body.data.find((r: { id: string }) => r.id === capsuleId);
    expect(match).toBeTruthy();
    expect(Object.keys(match)).not.toContain('contentDocEnc');
    expect(Object.keys(match)).not.toContain('content');
    expect(Object.keys(match).sort()).toEqual(['cover', 'id', 'kind', 'matchedOn', 'state', 'title'].sort());
  });

  it('excludes trashed capsules from title matches', async () => {
    const { accessToken } = await createUser();
    const capsuleId = (await authed(accessToken).post('/v1/capsules').send({ type: 'personal' })).body.capsule.id as string;
    await authed(accessToken).patch(`/v1/capsules/${capsuleId}`).send({ title: 'Trashed Probe Capsule' });
    await authed(accessToken).post(`/v1/capsules/${capsuleId}/trash`).send({});

    const res = await authed(accessToken).get('/v1/search?q=trashed');
    expect(res.body.data.find((r: { id: string }) => r.id === capsuleId)).toBeUndefined();
  });
});
