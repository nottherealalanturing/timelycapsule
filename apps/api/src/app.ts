import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { HealthResponseSchema, SystemTimeResponseSchema } from '@tc/contracts';
import type { Database } from './db/client.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { authRouter } from './modules/auth/index.js';
import { capsulesRouter } from './modules/capsules/index.js';
import { emailWebhookRouter } from './modules/email/index.js';

export function createApp(db: Database): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(
    express.json({
      // Resend's webhook (modules/email/webhook.ts) is Svix-signed against
      // the exact raw request bytes — re-serializing the parsed JSON
      // wouldn't reliably byte-match, so the raw buffer is captured here
      // once for every request rather than double-parsing the body.
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(pinoHttp({ logger }));

  // Bare infra routes. Feature routes (auth, capsules, ...) mount under
  // modules/, each importing the middleware in src/middleware/* per
  // apps/api/CONVENTIONS.md.
  app.use('/v1', authRouter(db));
  app.use('/v1', capsulesRouter(db));
  app.use('/v1', emailWebhookRouter(db));

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
