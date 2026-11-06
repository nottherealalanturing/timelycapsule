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
import { collectionsRouter } from './modules/collections/index.js';
import { contactsRouter } from './modules/contacts/index.js';
import { emailWebhookRouter } from './modules/email/index.js';
import { favoritesRouter } from './modules/favorites/index.js';
import { mediaRouter } from './modules/media/index.js';
import { notificationsRouter } from './modules/notifications/index.js';
import { placesRouter } from './modules/places/index.js';
import { receivedRouter } from './modules/received/index.js';
import { blocksRouter, recipientsRouter } from './modules/recipients/index.js';
import { revealRouter } from './modules/reveal/index.js';
import { guestRepliesRouter, repliesRouter, senderRepliesRouter } from './modules/replies/index.js';
import { guestRouter } from './modules/guest/index.js';
import { searchRouter } from './modules/search/index.js';
import { settingsRouter } from './modules/settings/index.js';
import { tagsRouter } from './modules/tags/index.js';

/**
 * CORS allow-list. Production sets CORS_ORIGINS (comma-separated) and falls
 * back to APP_URL; requests without an Origin header (mobile apps, curl,
 * server-to-server webhooks) are unaffected because CORS is a browser control.
 * Outside production with nothing configured the old permissive behaviour is
 * kept so local web dev keeps working.
 */
export function corsOptions(env: NodeJS.ProcessEnv = process.env): cors.CorsOptions {
  const allowed = (env.CORS_ORIGINS ?? (env.NODE_ENV === 'production' ? env.APP_URL : '') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (allowed.length === 0 && env.NODE_ENV !== 'production') return {};
  return {
    origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Platform', 'X-Device-Name'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
  };
}

export function createApp(db: Database): express.Express {
  const app = express();

  // Behind Caddy (and Cloudflare in front of it) the socket peer is the proxy,
  // so `req.ip` (rate-limit keys, session/audit ip) is only meaningful when
  // Express is told how many proxy hops to trust. A hop COUNT is used on
  // purpose (not a CIDR list). Unset/0 = trust nothing (dev, tests).
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS);
  if (Number.isInteger(proxyHops) && proxyHops > 0) {
    app.set('trust proxy', proxyHops);
  }

  app.use(helmet());
  app.use(cors(corsOptions()));
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
  app.use('/v1', recipientsRouter(db));
  app.use('/v1', blocksRouter(db));
  app.use('/v1', mediaRouter(db));
  app.use('/v1', notificationsRouter(db));
  app.use('/v1', revealRouter(db));
  app.use('/v1', repliesRouter(db));
  app.use('/v1', senderRepliesRouter(db));
  app.use('/v1', guestRepliesRouter(db));
  app.use('/v1', guestRouter(db));
  app.use('/v1', contactsRouter(db));
  app.use('/v1', receivedRouter(db));
  app.use('/v1', tagsRouter(db));
  app.use('/v1', favoritesRouter(db));
  app.use('/v1', collectionsRouter(db));
  app.use('/v1', searchRouter(db));
  app.use('/v1', settingsRouter(db));
  app.use('/v1', placesRouter(db));
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
