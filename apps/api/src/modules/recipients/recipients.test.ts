import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { blocks, capsuleRecipients, capsules, entitlements, users } from '../../db/schema/index.js';

const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `recipient-test-${randomUUID()}@example.com`;
}

async function createUser() {
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
  return { app, userId, email, accessToken: signupRes.body.tokens.accessToken as string };
}

function authed(app: ReturnType<typeof createApp>, token: string) {
  return {
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

async function createDraftCapsule(app: ReturnType<typeof createApp>, token: string): Promise<string> {
  const res = await authed(app, token).post('/v1/capsules').send({ type: 'personal' });
  expect(res.status).toBe(201);
  return res.body.capsule.id as string;
}

describe('recipients module (T-09)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(blocks).where(eq(blocks.blockerUserId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('adds a recipient to a draft capsule and returns a raw access token once', async () => {
    const { app, userId, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);

    const res = await authed(app, accessToken)
      .post(`/v1/capsules/${capsuleId}/recipients`)
      .send({ email: uniqueEmail(), displayName: 'Grandma' });
    expect(res.status).toBe(201);
    expect(res.body.recipient.status).toBe('added');
    expect(res.body.accessToken).toMatch(/^[A-Z2-7]{26}$/);
    void userId;
  });

  it('allows adding a recipient to a sealed (pre-unlock) capsule', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    await authed(app, accessToken)
      .patch(`/v1/capsules/${capsuleId}`)
      .send({ unlockAt: new Date(Date.now() + 6 * 60_000).toISOString() });
    await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/seal`).send({});

    const res = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });
    expect(res.status).toBe(201);
  });

  it('rejects adding a recipient once the capsule is unlocked/expired/withdrawn', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    await db.update(capsules).set({ state: 'unlocked' }).where(eq(capsules.id, capsuleId));

    const res = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('recipient_locked');
  });

  it('rejects a 404 for another user\'s capsule', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const capsuleId = await createDraftCapsule(owner.app, owner.accessToken);

    const res = await authed(intruder.app, intruder.accessToken)
      .post(`/v1/capsules/${capsuleId}/recipients`)
      .send({ email: uniqueEmail() });
    expect(res.status).toBe(404);
  });

  describe('dedup', () => {
    it('rejects adding the same email twice', async () => {
      const { app, accessToken } = await createUser();
      const capsuleId = await createDraftCapsule(app, accessToken);
      const email = uniqueEmail();
      await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email });
      const second = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('recipient_already_added');
    });

    it('rejects adding the same phone number twice, even with different formatting', async () => {
      const { app, accessToken } = await createUser();
      const capsuleId = await createDraftCapsule(app, accessToken);
      await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ phone: '+1 (555) 123-4567' });
      const second = await authed(app, accessToken)
        .post(`/v1/capsules/${capsuleId}/recipients`)
        .send({ phone: '15551234567' });
      expect(second.status).toBe(409);
    });

    it('rejects a PATCH that collides with another recipient\'s email', async () => {
      const { app, accessToken } = await createUser();
      const capsuleId = await createDraftCapsule(app, accessToken);
      const emailA = uniqueEmail();
      const emailB = uniqueEmail();
      await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: emailA });
      const b = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: emailB });

      const res = await authed(app, accessToken)
        .patch(`/v1/capsules/${capsuleId}/recipients/${b.body.recipient.id}`)
        .send({ email: emailA });
      expect(res.status).toBe(409);
    });
  });

  it('enforces the free-plan limit of 3 recipients per capsule', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    for (let i = 0; i < 3; i++) {
      const res = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });
      expect(res.status).toBe(201);
    }
    const fourth = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });
    expect(fourth.status).toBe(403);
    expect(fourth.body.error.code).toBe('quota_exceeded');
  });

  it('patches a recipient\'s email', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    const create = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });
    const newEmail = uniqueEmail();

    const res = await authed(app, accessToken)
      .patch(`/v1/capsules/${capsuleId}/recipients/${create.body.recipient.id}`)
      .send({ email: newEmail });
    expect(res.status).toBe(200);
    expect(res.body.recipient.email).toBe(newEmail);
  });

  it('deletes a recipient, then 404s on repeat delete', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    const create = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });
    const rid = create.body.recipient.id;

    const del = await authed(app, accessToken).delete(`/v1/capsules/${capsuleId}/recipients/${rid}`);
    expect(del.status).toBe(204);
    const again = await authed(app, accessToken).delete(`/v1/capsules/${capsuleId}/recipients/${rid}`);
    expect(again.status).toBe(404);
  });

  it('lists recipients without leaking the access token hash', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });

    const res = await authed(app, accessToken).get(`/v1/capsules/${capsuleId}/recipients`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('accessTokenHash');
  });

  it('resend-invite is a stub that succeeds and requires the recipient to exist', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    const create = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients`).send({ email: uniqueEmail() });

    const res = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/recipients/${create.body.recipient.id}/resend-invite`).send({});
    expect(res.status).toBe(202);

    const missing = await authed(app, accessToken)
      .post(`/v1/capsules/${capsuleId}/recipients/${randomUUID()}/resend-invite`)
      .send({});
    expect(missing.status).toBe(404);
  });

  describe('block suppression (DoD)', () => {
    it('masks success when the recipient has blocked the sender, but marks the row blocked_suppressed', async () => {
      const sender = await createUser();
      const recipientUser = await createUser();

      const block = await authed(recipientUser.app, recipientUser.accessToken)
        .post('/v1/blocks')
        .send({ email: sender.email });
      expect(block.status).toBe(201);

      const capsuleId = await createDraftCapsule(sender.app, sender.accessToken);
      const res = await authed(sender.app, sender.accessToken)
        .post(`/v1/capsules/${capsuleId}/recipients`)
        .send({ email: recipientUser.email });

      // Masked success: identical HTTP shape to a normal add.
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toMatch(/^[A-Z2-7]{26}$/);
      // ...but the row is pre-suppressed so nothing is ever actually delivered.
      expect(res.body.recipient.status).toBe('blocked_suppressed');

      const row = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, res.body.recipient.id));
      expect(row[0]?.status).toBe('blocked_suppressed');
    });

    it('does not suppress once the block is removed', async () => {
      const sender = await createUser();
      const recipientUser = await createUser();
      await authed(recipientUser.app, recipientUser.accessToken).post('/v1/blocks').send({ email: sender.email });
      await authed(recipientUser.app, recipientUser.accessToken).delete(`/v1/blocks/${encodeURIComponent(sender.email)}`);

      const capsuleId = await createDraftCapsule(sender.app, sender.accessToken);
      const res = await authed(sender.app, sender.accessToken)
        .post(`/v1/capsules/${capsuleId}/recipients`)
        .send({ email: recipientUser.email });
      expect(res.body.recipient.status).toBe('added');
    });

    it('lists and removes blocks', async () => {
      const { app, accessToken } = await createUser();
      const blockedEmail = uniqueEmail();
      await authed(app, accessToken).post('/v1/blocks').send({ email: blockedEmail });

      const list = await authed(app, accessToken).get('/v1/blocks');
      expect(list.status).toBe(200);
      expect(list.body.data.some((b: { blockedEmail: string }) => b.blockedEmail === blockedEmail)).toBe(true);

      const del = await authed(app, accessToken).delete(`/v1/blocks/${encodeURIComponent(blockedEmail)}`);
      expect(del.status).toBe(204);

      const listAfter = await authed(app, accessToken).get('/v1/blocks');
      expect(listAfter.body.data.some((b: { blockedEmail: string }) => b.blockedEmail === blockedEmail)).toBe(false);
    });
  });
});
