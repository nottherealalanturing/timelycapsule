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
  return `places-test-${randomUUID()}@example.com`;
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

describe('places module (Product Quality Pass, 2026-08)', () => {
  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('reverse-geocodes coordinates for an authenticated user (fake adapter under NODE_ENV=test)', async () => {
    const { accessToken } = await createUser();
    const res = await request(app)
      .post('/v1/places/reverse-geocode')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ lat: 6.4541, lng: 3.3947 });

    expect(res.status).toBe(200);
    expect(typeof res.body.name).toBe('string');
    expect(res.body.name.length).toBeGreaterThan(0);
  });

  it('401s an unauthenticated lookup — coordinates never travel without a session', async () => {
    const res = await request(app).post('/v1/places/reverse-geocode').send({ lat: 6.4541, lng: 3.3947 });
    expect(res.status).toBe(401);
  });

  it('rejects out-of-range coordinates before any lookup happens', async () => {
    const { accessToken } = await createUser();
    const res = await request(app)
      .post('/v1/places/reverse-geocode')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ lat: 999, lng: 3.3947 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});
