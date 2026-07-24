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
