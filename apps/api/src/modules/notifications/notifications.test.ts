import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { notificationPrefs, notifications, pushTokens, users } from '../../db/schema/index.js';

const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `notif-test-${randomUUID()}@example.com`;
}

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
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

describe('notifications module (T-14)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(notifications).where(eq(notifications.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(notificationPrefs).where(eq(notificationPrefs.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(pushTokens).where(eq(pushTokens.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('defaults to no quiet hours and no opt-outs', async () => {
    const { app, accessToken } = await createVerifiedUser();
    const res = await authed(app, accessToken).get('/v1/me/notification-prefs');
    expect(res.status).toBe(200);
    expect(res.body.prefs).toEqual({ quietHours: null, emailOptOut: [] });
  });

  it('rejects opting security out of email', async () => {
    const { app, accessToken } = await createVerifiedUser();
    const res = await authed(app, accessToken)
      .put('/v1/me/notification-prefs')
      .send({ quietHours: null, emailOptOut: ['security'] });
    expect(res.status).toBe(400);
  });

  it('persists quiet hours and opt-outs', async () => {
    const { app, accessToken } = await createVerifiedUser();
    const put = await authed(app, accessToken)
      .put('/v1/me/notification-prefs')
      .send({ quietHours: { start: '22:00', end: '08:00' }, emailOptOut: ['digest', 'product'] });
    expect(put.status).toBe(200);

    const get = await authed(app, accessToken).get('/v1/me/notification-prefs');
    expect(get.body.prefs).toEqual({ quietHours: { start: '22:00', end: '08:00' }, emailOptOut: ['digest', 'product'] });
  });

  it('lists notifications and marks them read (specific ids, then all)', async () => {
    const { app, accessToken, userId } = await createVerifiedUser();
    await db.insert(notifications).values([
      { userId, category: 'unlock', title: 'First' },
      { userId, category: 'reminder', title: 'Second' },
      { userId, category: 'delivery', title: 'Third' },
    ]);

    const list = await authed(app, accessToken).get('/v1/notifications');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.data.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);

    const oneId = list.body.data[0].id as string;
    const markOne = await authed(app, accessToken).post('/v1/notifications/read').send({ ids: [oneId] });
    expect(markOne.status).toBe(204);

    const afterOne = await authed(app, accessToken).get('/v1/notifications');
    const stillUnread = afterOne.body.data.filter((n: { readAt: string | null }) => n.readAt === null);
    expect(stillUnread).toHaveLength(2);

    const markAll = await authed(app, accessToken).post('/v1/notifications/read').send({});
    expect(markAll.status).toBe(204);

    const afterAllRead = await authed(app, accessToken).get('/v1/notifications');
    expect(afterAllRead.body.data.every((n: { readAt: string | null }) => n.readAt !== null)).toBe(true);
  });

  it('only ever returns the caller\'s own notifications', async () => {
    const a = await createVerifiedUser();
    const b = await createVerifiedUser();
    await db.insert(notifications).values({ userId: a.userId, category: 'unlock', title: 'Only for A' });

    const bList = await authed(b.app, b.accessToken).get('/v1/notifications');
    expect(bList.body.data).toHaveLength(0);
  });

  describe('push token registration', () => {
    it('registers a push token and returns it without the raw token value', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const res = await authed(app, accessToken)
        .post('/v1/me/push-tokens')
        .send({ token: `expo-token-${randomUUID()}`, platform: 'ios' });

      expect(res.status).toBe(200);
      expect(res.body.pushToken).toMatchObject({ platform: 'ios' });
      expect(res.body.pushToken.id).toBeTypeOf('string');
      expect(res.body.pushToken.token).toBeUndefined();
    });

    it('re-registering the same token moves it to the new caller instead of erroring', async () => {
      const a = await createVerifiedUser();
      const b = await createVerifiedUser();
      const token = `expo-token-${randomUUID()}`;

      const first = await authed(a.app, a.accessToken).post('/v1/me/push-tokens').send({ token, platform: 'android' });
      expect(first.status).toBe(200);

      const second = await authed(b.app, b.accessToken).post('/v1/me/push-tokens').send({ token, platform: 'android' });
      expect(second.status).toBe(200);
      expect(second.body.pushToken.id).toBe(first.body.pushToken.id);

      const [row] = await db.select().from(pushTokens).where(eq(pushTokens.token, token));
      expect(row?.userId).toBe(b.userId);
    });

    it('unregisters a push token the caller owns', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const register = await authed(app, accessToken)
        .post('/v1/me/push-tokens')
        .send({ token: `expo-token-${randomUUID()}`, platform: 'web' });

      const del = await authed(app, accessToken).delete(`/v1/me/push-tokens/${register.body.pushToken.id}`);
      expect(del.status).toBe(204);

      const [row] = await db.select().from(pushTokens).where(eq(pushTokens.id, register.body.pushToken.id));
      expect(row).toBeUndefined();
    });

    it('refuses to unregister a push token belonging to another user', async () => {
      const a = await createVerifiedUser();
      const b = await createVerifiedUser();
      const register = await authed(a.app, a.accessToken)
        .post('/v1/me/push-tokens')
        .send({ token: `expo-token-${randomUUID()}`, platform: 'ios' });

      const del = await authed(b.app, b.accessToken).delete(`/v1/me/push-tokens/${register.body.pushToken.id}`);
      expect(del.status).toBe(404);

      const [row] = await db.select().from(pushTokens).where(eq(pushTokens.id, register.body.pushToken.id));
      expect(row).toBeDefined();
    });

    it('rejects an unrecognized platform value', async () => {
      const { app, accessToken } = await createVerifiedUser();
      const res = await authed(app, accessToken).post('/v1/me/push-tokens').send({ token: 'x', platform: 'windows' });
      expect(res.status).toBe(400);
    });
  });
});
