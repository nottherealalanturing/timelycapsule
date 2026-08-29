import { MarkNotificationsReadRequestSchema, NotificationPrefsSchema, PaginatedQuerySchema, RegisterPushTokenRequestSchema, type PaginatedQuery } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import {
  getNotificationPrefs,
  listNotifications,
  markNotificationsRead,
  putNotificationPrefs,
  registerPushToken,
  unregisterPushToken,
} from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });

export function notificationsRouter(db: Database): Router {
  const router = Router();
  router.use(['/notifications', '/me/notification-prefs', '/me/push-tokens'], requireAuth());

  router.get('/notifications', validate({ query: PaginatedQuerySchema }), async (req, res, next) => {
    try {
      const query = (req as unknown as { validatedQuery: PaginatedQuery }).validatedQuery;
      const result = await listNotifications(db, req.user!.id, query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/notifications/read',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: MarkNotificationsReadRequestSchema }),
    async (req, res, next) => {
      try {
        await markNotificationsRead(db, req.user!.id, req.body);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/me/notification-prefs', async (req, res, next) => {
    try {
      const prefs = await getNotificationPrefs(db, req.user!.id);
      res.status(200).json({ prefs });
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/me/notification-prefs',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: NotificationPrefsSchema }),
    async (req, res, next) => {
      try {
        const prefs = await putNotificationPrefs(db, req.user!.id, req.body);
        res.status(200).json({ prefs });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/me/push-tokens',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: RegisterPushTokenRequestSchema }),
    async (req, res, next) => {
      try {
        const pushToken = await registerPushToken(db, req.user!.id, req.body);
        res.status(200).json({ pushToken });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/me/push-tokens/:id',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        await unregisterPushToken(db, req.user!.id, req.params.id as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
