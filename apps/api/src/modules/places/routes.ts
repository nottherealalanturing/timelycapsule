import { ReverseGeocodeRequestSchema, ReverseGeocodeResponseSchema } from '@tc/contracts';
import { Router } from 'express';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { reverseGeocode } from './service.js';

/**
 * `db` is unused — kept in the signature so this module mounts the same way
 * as every other feature router in app.ts, even though a stateless lookup
 * needs no database handle.
 */
export function placesRouter(_db: Database): Router {
  const router = Router();
  router.use('/places', requireAuth());

  router.post(
    '/places/reverse-geocode',
    // Tighter than the usual 60/15min: this calls a metered third-party API
    // on the user's behalf, and the action is a single deliberate click, not
    // a bulk operation — 20/15min comfortably covers real use while keeping
    // one account from burning through the provider's daily quota.
    rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: ReverseGeocodeRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await reverseGeocode(req.body);
        res.status(200).json(ReverseGeocodeResponseSchema.parse(result));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
