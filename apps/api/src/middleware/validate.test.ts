import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from './error-handler.js';
import { validate } from './validate.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.post(
    '/echo',
    validate({ body: z.object({ name: z.string().min(1) }) }),
    (req, res) => {
      res.json({ received: req.body });
    },
  );

  app.get(
    '/search',
    validate({ query: z.object({ q: z.string().default('') }) }),
    (req, res) => {
      res.json({ query: (req as express.Request & { validatedQuery?: unknown }).validatedQuery });
    },
  );

  app.use(errorHandler);
  return app;
}

describe('validate middleware', () => {
  it('passes through and coerces a valid body', async () => {
    const res = await request(buildTestApp()).post('/echo').send({ name: 'Maya' });
    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({ name: 'Maya' });
  });

  it('rejects an invalid body with the standard error envelope', async () => {
    const res = await request(buildTestApp()).post('/echo').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.requestId).toBeDefined();
    expect(res.body.error.details).toBeDefined();
  });

  it('applies defaults from the query schema', async () => {
    const res = await request(buildTestApp()).get('/search');
    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({ q: '' });
  });
});
