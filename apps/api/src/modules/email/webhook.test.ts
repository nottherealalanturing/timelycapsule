import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { Webhook } from 'svix';
import { afterAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { capsuleRecipients, capsules, notifications, outboundMessages, users } from '../../db/schema/index.js';
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
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(outboundMessages).where(eq(outboundMessages.id, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
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

  it('escalates on the 2nd hard bounce to the same address: flags the recipient + notifies + emails the owner', async () => {
    const app = buildTestApp();
    const bouncedEmail = `bounce-${randomUUID()}@example.com`;

    const [owner] = await db
      .insert(users)
      .values({ email: `owner-${randomUUID()}@example.com`, displayName: 'Bounce Test Owner', status: 'active' })
      .returning();
    createdUserIds.push(owner!.id);

    const [capsule] = await db
      .insert(capsules)
      .values({
        ownerId: owner!.id,
        type: 'personal',
        publicId: randomUUID().slice(0, 8).toUpperCase(),
        state: 'sealed',
        unlockAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        title: 'Escalation test capsule',
      })
      .returning();

    const [recipient] = await db
      .insert(capsuleRecipients)
      .values({ capsuleId: capsule!.id, email: bouncedEmail, accessTokenHash: randomUUID(), status: 'added' })
      .returning();

    // First bounce — below the 2-hard-bounce threshold, no escalation yet.
    const [firstRow] = await db
      .insert(outboundMessages)
      .values({ channel: 'email', toRef: bouncedEmail, template: 'something-waiting', providerId: `resend-${randomUUID()}` })
      .returning();
    createdIds.push(firstRow!.id);
    await signedPost(app, secret, { type: 'email.bounced', data: { email_id: firstRow!.providerId, to: [bouncedEmail] } });

    const [afterFirst] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipient!.id));
    expect(afterFirst?.status).toBe('added'); // not yet escalated

    // Second bounce — crosses the threshold.
    const [secondRow] = await db
      .insert(outboundMessages)
      .values({ channel: 'email', toRef: bouncedEmail, template: 'something-waiting', providerId: `resend-${randomUUID()}` })
      .returning();
    createdIds.push(secondRow!.id);
    const res = await signedPost(app, secret, { type: 'email.bounced', data: { email_id: secondRow!.providerId, to: [bouncedEmail] } });
    expect(res.status).toBe(200);

    const [afterSecond] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.id, recipient!.id));
    expect(afterSecond?.status).toBe('bounced');

    const inAppNotifications = await db.select().from(notifications).where(eq(notifications.userId, owner!.id));
    expect(inAppNotifications.some((n) => n.category === 'delivery')).toBe(true);

    const bounceAlertEmails = await db.select().from(outboundMessages).where(eq(outboundMessages.toRef, owner!.email));
    createdIds.push(...bounceAlertEmails.map((m) => m.id));
    expect(bounceAlertEmails.some((m) => m.template === 'bounce-alert' && m.state === 'sent')).toBe(true);

    await db.delete(notifications).where(eq(notifications.userId, owner!.id));
    await db.delete(capsuleRecipients).where(eq(capsuleRecipients.id, recipient!.id));
    await db.delete(capsules).where(eq(capsules.id, capsule!.id));
  });
});
