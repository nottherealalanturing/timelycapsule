import { PutFavoriteRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { setFavorite } from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });

export function favoritesRouter(db: Database): Router {
  const router = Router();
  router.use('/capsules', requireAuth());

  router.put(
    '/capsules/:id/favorite',
    validate({ params: IdParamSchema, body: PutFavoriteRequestSchema }),
    async (req, res, next) => {
      try {
        await setFavorite(db, req.user!.id, req.params.id as string, req.body.value);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
