import { describe, expect, it } from 'vitest';
import request from 'supertest';
import './env.js';
import { createApp } from './app.js';
import { db } from './db/client.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = createApp(db);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /v1/system/time', () => {
  it('returns an ISO timestamp', async () => {
    const app = createApp(db);
    const res = await request(app).get('/v1/system/time');
    expect(res.status).toBe(200);
    expect(new Date(res.body.serverTime).toString()).not.toBe('Invalid Date');
  });
});

describe('unmatched routes', () => {
  it('return the standard 404 error envelope', async () => {
    const app = createApp(db);
    const res = await request(app).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.body.error.requestId).toBeDefined();
  });
});

describe('request body errors', () => {
  it('malformed JSON returns 400 validation_failed, not 500', async () => {
    const app = createApp(db);
    const res = await request(app)
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(typeof res.body.error.requestId).toBe('string');
  });

  it('oversized JSON returns 413, not 500', async () => {
    const app = createApp(db);
    const res = await request(app)
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('trusted proxy + rate limiting', () => {
  const login = (app: ReturnType<typeof createApp>, ip?: string) => {
    const r = request(app).post('/v1/auth/login').send({});
    return ip ? r.set('X-Forwarded-For', ip) : r;
  };

  it('with TRUST_PROXY_HOPS=1 each forwarded client IP has its own bucket', async () => {
    process.env.TRUST_PROXY_HOPS = '1';
    try {
      const app = createApp(db);
      for (let i = 0; i < 10; i += 1) await login(app, '203.0.113.7');
      expect((await login(app, '203.0.113.7')).status).toBe(429);
      expect((await login(app, '198.51.100.9')).status).toBe(400);
    } finally {
      delete process.env.TRUST_PROXY_HOPS;
    }
  });

  it('without trust proxy X-Forwarded-For is ignored (cannot be spoofed to dodge limits)', async () => {
    const app = createApp(db);
    for (let i = 0; i < 10; i += 1) await login(app, `192.0.2.${i + 1}`);
    expect((await login(app, '192.0.2.200')).status).toBe(429);
  });
});

describe('CORS allow-list', () => {
  it('production: allows only configured origins', async () => {
    const { corsOptions } = await import('./app.js');
    const opts = corsOptions({ NODE_ENV: 'production', APP_URL: 'https://timelycapsule.com' } as NodeJS.ProcessEnv);
    const check = (origin?: string) =>
      new Promise<boolean | undefined>((resolve) =>
        (opts.origin as (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => void)(origin, (_e, ok) =>
          resolve(ok),
        ),
      );
    expect(await check('https://timelycapsule.com')).toBe(true);
    expect(await check('https://evil.example')).toBe(false);
    expect(await check(undefined)).toBe(true); // mobile / server-to-server
  });
});
