import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsuleRecipients, capsules, entitlements, users } from '../../db/schema/index.js';

const app = createApp(db);
const createdUserIds: string[] = [];
const createdCapsuleIds: string[] = [];

function uniqueEmail(prefix = 'contacts-test'): string {
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
  return { userId, email, accessToken: signupRes.body.tokens.accessToken as string };
}

function authed(token: string) {
  return {
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

describe('contacts module (T-16)', () => {
  afterAll(async () => {
    for (const id of createdCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('creates, lists, patches, and deletes a contact', async () => {
    const { accessToken } = await createUser();

    const createRes = await authed(accessToken)
      .post('/v1/contacts')
      .send({ name: 'Amara', email: uniqueEmail('amara'), birthday: '1996-03-14' });
    expect(createRes.status).toBe(201);
    const contactId = createRes.body.contact.id as string;
    expect(createRes.body.contact.capsulesExchanged).toBe(0);
    expect(createRes.body.contact.groupIds).toEqual([]);

    const listRes = await authed(accessToken).get('/v1/contacts');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const patchRes = await authed(accessToken).patch(`/v1/contacts/${contactId}`).send({ name: 'Amara K.' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.contact.name).toBe('Amara K.');

    const deleteRes = await authed(accessToken).delete(`/v1/contacts/${contactId}`);
    expect(deleteRes.status).toBe(204);

    const listAfter = await authed(accessToken).get('/v1/contacts');
    expect(listAfter.body.data).toHaveLength(0);
  });

  it('404s on another user’s contact', async () => {
    const owner = await createUser();
    const stranger = await createUser();

    const createRes = await authed(owner.accessToken).post('/v1/contacts').send({ name: 'Private Contact' });
    const contactId = createRes.body.contact.id as string;

    const res = await authed(stranger.accessToken).patch(`/v1/contacts/${contactId}`).send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('groups: create, add/remove member, delete', async () => {
    const { accessToken } = await createUser();

    const contactRes = await authed(accessToken).post('/v1/contacts').send({ name: 'Group Member' });
    const contactId = contactRes.body.contact.id as string;

    const groupRes = await authed(accessToken).post('/v1/contact-groups').send({ name: 'Family' });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.group.id as string;

    const addRes = await authed(accessToken).post(`/v1/contact-groups/${groupId}/members`).send({ contactId });
    expect(addRes.status).toBe(204);

    const listRes = await authed(accessToken).get('/v1/contacts');
    expect(listRes.body.data[0].groupIds).toEqual([groupId]);

    const removeRes = await authed(accessToken).delete(`/v1/contact-groups/${groupId}/members/${contactId}`);
    expect(removeRes.status).toBe(204);

    const listAfter = await authed(accessToken).get('/v1/contacts');
    expect(listAfter.body.data[0].groupIds).toEqual([]);

    const deleteGroupRes = await authed(accessToken).delete(`/v1/contact-groups/${groupId}`);
    expect(deleteGroupRes.status).toBe(204);
  });

  it('computes capsulesExchanged from sent capsule_recipients rows', async () => {
    const { userId, accessToken } = await createUser();
    const contactEmail = uniqueEmail('exchanged');

    const [capsule] = await db
      .insert(capsules)
      .values({ ownerId: userId, type: 'personal', publicId: randomUUID().slice(0, 8).toUpperCase(), state: 'draft' })
      .returning();
    createdCapsuleIds.push(capsule!.id);
    await db.insert(capsuleRecipients).values({
      capsuleId: capsule!.id,
      email: contactEmail,
      accessTokenHash: randomUUID(),
      status: 'added',
    });

    await authed(accessToken).post('/v1/contacts').send({ name: 'Exchanged Contact', email: contactEmail });

    const listRes = await authed(accessToken).get('/v1/contacts');
    expect(listRes.body.data[0].capsulesExchanged).toBe(1);
  });
});
