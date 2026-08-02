import { ReportRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { listReceived, reportReceived } from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });

export function receivedRouter(db: Database): Router {
  const router = Router();
  router.use('/received', requireAuth());

  router.get('/received', async (req, res, next) => {
    try {
      const data = await listReceived(db, req.user!.id);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/received/:id/report',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema, body: ReportRequestSchema }),
    async (req, res, next) => {
      try {
        await reportReceived(db, req.user!.id, req.params.id as string, req.body);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
