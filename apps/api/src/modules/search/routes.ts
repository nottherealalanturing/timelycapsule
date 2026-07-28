import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { search } from './service.js';

const SearchQuerySchema = z.object({ q: z.string().min(1).max(200) });

export function searchRouter(db: Database): Router {
  const router = Router();
  router.use('/search', requireAuth());

  router.get('/search', validate({ query: SearchQuerySchema }), async (req, res, next) => {
    try {
      const query = (req as unknown as { validatedQuery: z.infer<typeof SearchQuerySchema> }).validatedQuery;
      const data = await search(db, req.user!.id, query.q);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
