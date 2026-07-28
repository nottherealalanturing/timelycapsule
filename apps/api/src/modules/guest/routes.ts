import { CreateGuestCapsuleRequestSchema, PatchGuestCapsuleRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { createGuestCapsule, createGuestSession, getGuestCapsule, patchGuestCapsule, sealGuestCapsule } from './service.js';
import { requireGuestSession } from './middleware.js';

const CapsuleParamsSchema = z.object({ id: z.string().uuid() });

/** Anonymous, heavily rate-limited per IP (01 §4.1b / 03 §14 GUEST). */
export function guestRouter(db: Database): Router {
  const router = Router();

  router.post('/guest/sessions', rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), async (req, res, next) => {
    try {
      const result = await createGuestSession(db, req.ip);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/guest/capsules',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }),
    requireGuestSession(db),
    validate({ body: CreateGuestCapsuleRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await createGuestCapsule(db, req.guestSession!.id, req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/guest/capsules/:id',
    requireGuestSession(db),
    validate({ params: CapsuleParamsSchema, body: PatchGuestCapsuleRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await patchGuestCapsule(db, req.guestSession!.id, req.params.id as string, req.body);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/guest/capsules/:id/seal',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }),
    requireGuestSession(db),
    validate({ params: CapsuleParamsSchema }),
    async (req, res, next) => {
      try {
        const result = await sealGuestCapsule(db, req.guestSession!.id, req.params.id as string);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/guest/capsules/:id', requireGuestSession(db), validate({ params: CapsuleParamsSchema }), async (req, res, next) => {
    try {
      const result = await getGuestCapsule(db, req.guestSession!.id, req.params.id as string);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
