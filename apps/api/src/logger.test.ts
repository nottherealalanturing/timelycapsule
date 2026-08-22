import { Writable } from 'node:stream';
import express from 'express';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_OPTIONS } from './logger.js';

/**
 * Runtime proof, not a config-shape assertion — a real request, through the
 * real `pino-http` middleware, into a real (in-memory) pino destination,
 * built from the exact `LOG_REDACT_OPTIONS` `logger.ts` uses (imported, not
 * copied, so this can't quietly drift from what production actually runs).
 *
 * `logger.ts`'s own singleton can't be pointed at a capturable stream after
 * construction (pino's destination is fixed at construction time, and in
 * non-test envs it's a `pino-pretty` worker-thread transport that can't be
 * synchronously inspected in-process anyway) — so this builds a second,
 * throwaway instance for the one thing that needs a real stream to prove
 * against, wired through the same `pino-http` this app actually uses.
 */
function collectingLogger() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = pino({ redact: LOG_REDACT_OPTIONS }, sink);
  return { logger, lines };
}

describe('request log redaction', () => {
  it('does not write a bearer token or cookie value into the log output', async () => {
    const { logger, lines } = collectingLogger();
    const app = express();
    app.use(pinoHttp({ logger }));
    app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer test-secret-value')
      .set('Cookie', 'session=test-secret-value');

    // pino-http logs on the response's `finish` event, which — same process,
    // loopback connection — has already fired by the time supertest's
    // promise resolves; flushed here defensively rather than assumed.
    await new Promise((resolve) => setImmediate(resolve));

    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join('\n');

    expect(output).not.toContain('test-secret-value');
    expect(output).toContain('[Redacted]');

    const requestLine = lines.find((line) => line.includes('"req"'));
    expect(requestLine).toBeDefined();
    const parsed = JSON.parse(requestLine!) as { req: { headers: Record<string, string> } };
    expect(parsed.req.headers.authorization).toBe('[Redacted]');
    expect(parsed.req.headers.cookie).toBe('[Redacted]');
  });

  it('still logs ordinary, non-sensitive request metadata', async () => {
    const { logger, lines } = collectingLogger();
    const app = express();
    app.use(pinoHttp({ logger }));
    app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get('/probe').set('User-Agent', 'vitest-probe');
    await new Promise((resolve) => setImmediate(resolve));

    const requestLine = lines.find((line) => line.includes('"req"'));
    expect(requestLine).toBeDefined();
    const parsed = JSON.parse(requestLine!) as { req: { method: string; url: string; headers: Record<string, string> } };
    expect(parsed.req.method).toBe('GET');
    expect(parsed.req.url).toBe('/probe');
    expect(parsed.req.headers['user-agent']).toBe('vitest-probe');
  });
});
