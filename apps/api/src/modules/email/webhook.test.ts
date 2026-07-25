import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { Webhook } from 'svix';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { outboundMessages } from '../../db/schema/index.js';
import { emailWebhookRouter } from './webhook.js';

function buildTestApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(emailWebhookRouter(db));
  app.use(errorHandler);
  return app;
}

function signedPost(app: express.Express, secret: string, body: unknown) {
  const payload = JSON.stringify(body);
  const id = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);

  return request(app)
    .post('/webhooks/resend')
    .set('svix-id', id)
    .set('svix-timestamp', String(Math.floor(timestamp.getTime() / 1000)))
    .set('svix-signature', signature)
    .set('Content-Type', 'application/json')
    .send(payload);
}

describe('POST /webhooks/resend', () => {
  const secret = process.env.RESEND_WEBHOOK_SECRET!;
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(outboundMessages).where(eq(outboundMessages.id, id));
    }
    await pool.end();
  });

  it('rejects a request with no signature headers', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/webhooks/resend').send({ type: 'email.delivered', data: {} });
    expect(res.status).toBe(401);
  });

  it('rejects a request with an invalid signature', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/webhooks/resend')
      .set('svix-id', 'msg_fake')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,not-a-real-signature')
      .send({ type: 'email.delivered', data: { email_id: 'fake' } });
    expect(res.status).toBe(401);
  });

  it('updates the ledger to delivered on a valid email.delivered event', async () => {
    const app = buildTestApp();
    const [row] = await db
      .insert(outboundMessages)
      .values({ channel: 'email', toRef: 'test@example.com', template: 'verify-email', providerId: 'resend-id-1' })
      .returning();
    createdIds.push(row!.id);

    const res = await signedPost(app, secret, { type: 'email.delivered', data: { email_id: 'resend-id-1' } });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(outboundMessages).where(eq(outboundMessages.id, row!.id));
    expect(updated?.state).toBe('delivered');
  });

  it('updates the ledger to bounced on a valid email.bounced event', async () => {
    const app = buildTestApp();
    const [row] = await db
      .insert(outboundMessages)
      .values({ channel: 'email', toRef: 'test2@example.com', template: 'verify-email', providerId: 'resend-id-2' })
      .returning();
    createdIds.push(row!.id);

    const res = await signedPost(app, secret, { type: 'email.bounced', data: { email_id: 'resend-id-2' } });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(outboundMessages).where(eq(outboundMessages.id, row!.id));
    expect(updated?.state).toBe('bounced');
  });
});
