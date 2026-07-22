import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { HealthResponseSchema, SystemTimeResponseSchema } from '@tc/contracts';
import { logger } from './logger.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Minimal routes to prove the app boots end-to-end (T-01).
  // Full API conventions (Zod middleware, error envelope, rate limits,
  // idempotency) land in T-03 — do not add feature routes here yet.
  app.get('/health', (_req, res) => {
    const body = HealthResponseSchema.parse({
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    });
    res.json(body);
  });

  app.get('/v1/system/time', (_req, res) => {
    const body = SystemTimeResponseSchema.parse({
      serverTime: new Date().toISOString(),
    });
    res.json(body);
  });

  return app;
}
