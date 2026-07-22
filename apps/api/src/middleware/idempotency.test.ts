import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import '../env.js';
import { db, pool } from '../db/client.js';
import { idempotencyKeys } from '../db/schema/index.js';
import { errorHandler } from './error-handler.js';
import { idempotency } from './idempotency.js';

function buildTestApp(handler: (body: unknown) => unknown) {
  const app = express();
  app.use(express.json());
  app.use(idempotency(db));
  app.post('/charge', (req, res) => {
    res.json(handler(req.body));
  });
  app.use(errorHandler);
  return app;
}

describe('idempotency middleware', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('passes through untouched when no Idempotency-Key header is sent', async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const res = await request(buildTestApp(handler)).post('/charge').send({ amount: 5 });
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('replays the stored response for a repeated key + identical body without re-invoking the handler', async () => {
    const key = randomUUID();
    const handler = vi.fn(() => ({ chargedAt: Date.now() }));
    const app = buildTestApp(handler);

    const first = await request(app)
      .post('/charge')
      .set('Idempotency-Key', key)
      .send({ amount: 10 });
    const second = await request(app)
      .post('/charge')
      .set('Idempotency-Key', key)
      .send({ amount: 10 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused key with a different body as idempotency_conflict', async () => {
    const key = randomUUID();
    const app = buildTestApp(() => ({ ok: true }));

    const first = await request(app)
      .post('/charge')
      .set('Idempotency-Key', key)
      .send({ amount: 10 });
    const second = await request(app)
      .post('/charge')
      .set('Idempotency-Key', key)
      .send({ amount: 99 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('idempotency_conflict');
  });

  it('rejects a concurrent request against an in-progress key', async () => {
    const key = randomUUID();
    // Simulate a request that's still being processed (no response yet).
    await db.insert(idempotencyKeys).values({
      key,
      method: 'POST',
      path: '/charge',
      requestHash: createHash('sha256').update(JSON.stringify({ amount: 1 })).digest('hex'),
      status: 'in_progress',
    });

    const app = buildTestApp(() => ({ ok: true }));
    const res = await request(app).post('/charge').set('Idempotency-Key', key).send({ amount: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('idempotency_conflict');

    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
  });
});
