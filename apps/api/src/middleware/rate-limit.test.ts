import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './error-handler.js';
import { rateLimit } from './rate-limit.js';

function buildTestApp() {
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, max: 2, keyFn: () => 'fixed-key' }));
  app.get('/ping', (_req, res) => res.json({ pong: true }));
  app.use(errorHandler);
  return app;
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit and sets rate-limit headers', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('2');
    expect(res.headers['x-ratelimit-remaining']).toBe('1');
  });

  it('returns 429 with the rate_limited envelope once the limit is exceeded', async () => {
    const app = buildTestApp();
    await request(app).get('/ping');
    await request(app).get('/ping');
    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
    expect(res.body.error.details.retryAfter).toBeGreaterThanOrEqual(0);
  });
});
