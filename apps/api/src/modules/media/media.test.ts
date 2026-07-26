import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import '../../env.js';
import { createApp } from '../../app.js';
import { db, pool } from '../../db/client.js';
import { capsules, entitlements, mediaItems, users } from '../../db/schema/index.js';
import { FakeStorageAdapter } from './fake-adapter.js';
import { getStorageAdapter, resetStorageAdapterForTests } from './get-adapter.js';

const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `media-test-${randomUUID()}@example.com`;
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
  return { app, userId, accessToken: signupRes.body.tokens.accessToken as string };
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

/** Drives a ticket through to `ready`, forcing the fake adapter's recorded size to `sizeBytes` (rather than the default full-part-size assumption) so quota math in these tests is exact. */
async function uploadReadyMedia(
  app: ReturnType<typeof createApp>,
  token: string,
  capsuleId: string,
  opts: { name: string; mime: string; sizeBytes: number },
): Promise<{ mediaId: string }> {
  const ticket = await authed(app, token)
    .post(`/v1/capsules/${capsuleId}/media/tickets`)
    .send({ name: opts.name, mime: opts.mime, sizeBytes: opts.sizeBytes });
  expect(ticket.status).toBe(201);

  // Fake adapter sums each part's recorded size on complete, defaulting any
  // unset part to a full 8MB chunk — so to land on an exact total, put the
  // whole declared size on the first part and zero out the rest.
  const adapter = getStorageAdapter() as FakeStorageAdapter;
  (ticket.body.parts as { partNumber: number }[]).forEach((part, i) => {
    adapter.setFakePartSize(ticket.body.uploadId, part.partNumber, i === 0 ? opts.sizeBytes : 0);
  });

  const complete = await authed(app, token)
    .post(`/v1/media/${ticket.body.mediaId}/complete`)
    .send({ parts: (ticket.body.parts as { partNumber: number }[]).map((p) => ({ partNumber: p.partNumber, eTag: 'etag' })) });
  expect(complete.status).toBe(200);
  return { mediaId: ticket.body.mediaId as string };
}

describe('media module (T-10)', () => {
  afterEach(() => {
    resetStorageAdapterForTests();
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(entitlements).where(eq(entitlements.userId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(mediaItems).where(eq(mediaItems.uploaderId, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('uploads image, video, and pdf through the full ticket -> complete lifecycle and reaches ready (DoD)', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);

    for (const [name, mime] of [
      ['photo.jpg', 'image/jpeg'],
      ['clip.mp4', 'video/mp4'],
      ['doc.pdf', 'application/pdf'],
    ] as const) {
      const { mediaId } = await uploadReadyMedia(app, accessToken, capsuleId, { name, mime, sizeBytes: 1024 });
      const row = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId));
      expect(row[0]?.status).toBe('ready');
    }
  });

  it('rejects an unsupported MIME type', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);

    const res = await authed(app, accessToken)
      .post(`/v1/capsules/${capsuleId}/media/tickets`)
      .send({ name: 'malware.exe', mime: 'application/x-msdownload', sizeBytes: 1024 });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('unsupported_media_type');
  });

  it('enforces the free-plan per-file size cap', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);

    const res = await authed(app, accessToken)
      .post(`/v1/capsules/${capsuleId}/media/tickets`)
      .send({ name: 'huge.mp4', mime: 'video/mp4', sizeBytes: 26 * 1024 * 1024 });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('file_too_large');
  });

  it('enforces the free-plan aggregate storage quota across capsules', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);

    // Free plan: 25MB per-file cap, 100MB aggregate. Four 24MB uploads (96MB
    // total) stay under the per-file cap individually but leave no room for
    // a further 10MB file.
    for (let i = 0; i < 4; i++) {
      await uploadReadyMedia(app, accessToken, capsuleId, { name: `a${i}.jpg`, mime: 'image/jpeg', sizeBytes: 24 * 1024 * 1024 });
    }

    const res = await authed(app, accessToken)
      .post(`/v1/capsules/${capsuleId}/media/tickets`)
      .send({ name: 'b.jpg', mime: 'image/jpeg', sizeBytes: 10 * 1024 * 1024 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('quota_exceeded');
  });

  it('blocks sealing while media is not ready, then allows it once ready (DoD)', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    await authed(app, accessToken)
      .patch(`/v1/capsules/${capsuleId}`)
      .send({ unlockAt: new Date(Date.now() + 6 * 60_000).toISOString() });

    const ticket = await authed(app, accessToken)
      .post(`/v1/capsules/${capsuleId}/media/tickets`)
      .send({ name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: 1024 });
    expect(ticket.status).toBe(201);

    const blockedSeal = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/seal`).send({});
    expect(blockedSeal.status).toBe(409);
    expect(blockedSeal.body.error.code).toBe('upload_incomplete');

    const adapter = getStorageAdapter() as FakeStorageAdapter;
    for (const part of ticket.body.parts as { partNumber: number }[]) {
      adapter.setFakePartSize(ticket.body.uploadId, part.partNumber, 1024);
    }
    const complete = await authed(app, accessToken)
      .post(`/v1/media/${ticket.body.mediaId}/complete`)
      .send({ parts: (ticket.body.parts as { partNumber: number }[]).map((p) => ({ partNumber: p.partNumber, eTag: 'etag' })) });
    expect(complete.status).toBe(200);

    const seal = await authed(app, accessToken).post(`/v1/capsules/${capsuleId}/seal`).send({});
    expect(seal.status).toBe(200);
  });

  it('patches caption and position', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    const { mediaId } = await uploadReadyMedia(app, accessToken, capsuleId, { name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: 1024 });

    const res = await authed(app, accessToken).patch(`/v1/media/${mediaId}`).send({ caption: 'Grandma at the lake', position: 2 });
    expect(res.status).toBe(200);
    expect(res.body.media.caption).toBe('Grandma at the lake');
    expect(res.body.media.position).toBe(2);
  });

  it('returns a signed view URL for a ready item', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    const { mediaId } = await uploadReadyMedia(app, accessToken, capsuleId, { name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: 1024 });

    const res = await authed(app, accessToken).get(`/v1/media/${mediaId}/view`);
    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe('string');
    expect(res.body.expiresInSeconds).toBe(15 * 60);
  });

  it('deletes a media item and decrements capsule size_bytes, then 404s on repeat', async () => {
    const { app, accessToken } = await createUser();
    const capsuleId = await createDraftCapsule(app, accessToken);
    const { mediaId } = await uploadReadyMedia(app, accessToken, capsuleId, { name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: 4096 });

    const [before] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    expect(before?.sizeBytes).toBe(4096);

    const del = await authed(app, accessToken).delete(`/v1/media/${mediaId}`);
    expect(del.status).toBe(204);

    const [after] = await db.select().from(capsules).where(eq(capsules.id, capsuleId));
    expect(after?.sizeBytes).toBe(0);

    const again = await authed(app, accessToken).delete(`/v1/media/${mediaId}`);
    expect(again.status).toBe(404);
  });

  it('404s when a different user tries to touch someone else\'s media item', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const capsuleId = await createDraftCapsule(owner.app, owner.accessToken);
    const { mediaId } = await uploadReadyMedia(owner.app, owner.accessToken, capsuleId, {
      name: 'photo.jpg',
      mime: 'image/jpeg',
      sizeBytes: 1024,
    });

    const res = await authed(intruder.app, intruder.accessToken).get(`/v1/media/${mediaId}/view`);
    expect(res.status).toBe(404);
  });
});
