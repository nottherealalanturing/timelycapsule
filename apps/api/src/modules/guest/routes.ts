import {
  CompleteMediaRequestSchema,
  CreateGuestCapsuleRequestSchema,
  CreateMediaTicketRequestSchema,
  PatchGuestCapsuleRequestSchema,
  PatchMediaRequestSchema,
} from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import {
  completeGuestMedia,
  createGuestMediaTicket,
  deleteGuestMedia,
  getGuestMediaViewUrl,
  listGuestMedia,
  patchGuestMedia,
} from '../media/index.js';
import { createGuestCapsule, createGuestSession, getGuestCapsule, patchGuestCapsule, sealGuestCapsule } from './service.js';
import { requireGuestSession } from './middleware.js';

const CapsuleParamsSchema = z.object({ id: z.string().uuid() });
const MediaParamsSchema = z.object({ id: z.string().uuid() });

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

  router.get('/guest/capsules/:id/media', requireGuestSession(db), validate({ params: CapsuleParamsSchema }), async (req, res, next) => {
    try {
      const data = await listGuestMedia(db, req.guestSession!.id, req.params.id as string);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/guest/capsules/:id/media/tickets',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.guestSession?.id ?? (r.ip ?? 'unknown') }),
    requireGuestSession(db),
    validate({ params: CapsuleParamsSchema, body: CreateMediaTicketRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await createGuestMediaTicket(db, req.guestSession!.id, req.params.id as string, req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/guest/media/:id/complete',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.guestSession?.id ?? (r.ip ?? 'unknown') }),
    requireGuestSession(db),
    validate({ params: MediaParamsSchema, body: CompleteMediaRequestSchema }),
    async (req, res, next) => {
      try {
        const media = await completeGuestMedia(db, req.guestSession!.id, req.params.id as string, req.body);
        res.status(200).json({ media });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/guest/media/:id',
    requireGuestSession(db),
    validate({ params: MediaParamsSchema, body: PatchMediaRequestSchema }),
    async (req, res, next) => {
      try {
        const media = await patchGuestMedia(db, req.guestSession!.id, req.params.id as string, req.body);
        res.status(200).json({ media });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/guest/media/:id', requireGuestSession(db), validate({ params: MediaParamsSchema }), async (req, res, next) => {
    try {
      await deleteGuestMedia(db, req.guestSession!.id, req.params.id as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/guest/media/:id/view', requireGuestSession(db), validate({ params: MediaParamsSchema }), async (req, res, next) => {
    try {
      const result = await getGuestMediaViewUrl(db, req.guestSession!.id, req.params.id as string);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

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
