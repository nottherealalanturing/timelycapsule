import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /v1/system/time', () => {
  it('returns an ISO timestamp', async () => {
    const app = createApp();
    const res = await request(app).get('/v1/system/time');
    expect(res.status).toBe(200);
    expect(new Date(res.body.serverTime).toString()).not.toBe('Invalid Date');
  });
});
