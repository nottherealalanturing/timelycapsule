import { AvatarUploadRequestSchema, DeleteAccountRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import type { Database } from '../../db/client.js';
import { requireAuth } from '../auth/index.js';
import { createAvatarUploadTicket, getDeletionPreview, getStorage, requestAccountDeletion, requestExport } from './service.js';

export function settingsRouter(db: Database): Router {
  const router = Router();
  router.use('/me', requireAuth());

  router.get('/me/storage', async (req, res, next) => {
    try {
      const data = await getStorage(db, req.user!.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/me/avatar', validate({ body: AvatarUploadRequestSchema }), async (req, res, next) => {
    try {
      const data = await createAvatarUploadTicket(db, req.user!.id, req.body.contentType);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/me/export',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 3, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    async (req, res, next) => {
      try {
        const data = await requestExport(db, req.user!.id);
        res.status(202).json(data);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/me/deletion-preview', async (req, res, next) => {
    try {
      const needsDecision = await getDeletionPreview(db, req.user!.id);
      res.status(200).json({ needsDecision });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/me', validate({ body: DeleteAccountRequestSchema }), async (req, res, next) => {
    try {
      await requestAccountDeletion(db, req.user!.id, req.body.password, req.body.capsuleDecisions);
      res.status(202).json({});
    } catch (err) {
      next(err);
    }
  });

  return router;
}
