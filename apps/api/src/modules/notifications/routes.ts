import { MarkNotificationsReadRequestSchema, NotificationPrefsSchema, PaginatedQuerySchema, type PaginatedQuery } from '@tc/contracts';
import { Router } from 'express';
import type { Database } from '../../db/client.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { getNotificationPrefs, listNotifications, markNotificationsRead, putNotificationPrefs } from './service.js';

export function notificationsRouter(db: Database): Router {
  const router = Router();
  router.use(['/notifications', '/me/notification-prefs'], requireAuth());

  router.get('/notifications', validate({ query: PaginatedQuerySchema }), async (req, res, next) => {
    try {
      const query = (req as unknown as { validatedQuery: PaginatedQuery }).validatedQuery;
      const result = await listNotifications(db, req.user!.id, query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/read', validate({ body: MarkNotificationsReadRequestSchema }), async (req, res, next) => {
    try {
      await markNotificationsRead(db, req.user!.id, req.body);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/notification-prefs', async (req, res, next) => {
    try {
      const prefs = await getNotificationPrefs(db, req.user!.id);
      res.status(200).json({ prefs });
    } catch (err) {
      next(err);
    }
  });

  router.put('/me/notification-prefs', validate({ body: NotificationPrefsSchema }), async (req, res, next) => {
    try {
      const prefs = await putNotificationPrefs(db, req.user!.id, req.body);
      res.status(200).json({ prefs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
