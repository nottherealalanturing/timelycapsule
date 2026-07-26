import { CompleteMediaRequestSchema, CreateMediaTicketRequestSchema, PatchMediaRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { completeMedia, createMediaTicket, deleteMedia, getMediaViewUrl, listMedia, patchMedia } from './service.js';

const CapsuleIdParamSchema = z.object({ id: z.string().uuid() });
const MediaIdParamSchema = z.object({ id: z.string().uuid() });

export function mediaRouter(db: Database): Router {
  const router = Router();
  router.use('/capsules', requireAuth());
  router.use('/media', requireAuth());

  router.get('/capsules/:id/media', validate({ params: CapsuleIdParamSchema }), async (req, res, next) => {
    try {
      const data = await listMedia(db, req.user!.id, req.params.id as string);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/capsules/:id/media/tickets',
    idempotency(db),
    validate({ params: CapsuleIdParamSchema, body: CreateMediaTicketRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await createMediaTicket(db, req.user!.id, req.params.id as string, req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/media/:id/complete',
    idempotency(db),
    validate({ params: MediaIdParamSchema, body: CompleteMediaRequestSchema }),
    async (req, res, next) => {
      try {
        const media = await completeMedia(db, req.user!.id, req.params.id as string, req.body);
        res.status(200).json({ media });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch('/media/:id', validate({ params: MediaIdParamSchema, body: PatchMediaRequestSchema }), async (req, res, next) => {
    try {
      const media = await patchMedia(db, req.user!.id, req.params.id as string, req.body);
      res.status(200).json({ media });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/media/:id', validate({ params: MediaIdParamSchema }), async (req, res, next) => {
    try {
      await deleteMedia(db, req.user!.id, req.params.id as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/media/:id/view', validate({ params: MediaIdParamSchema }), async (req, res, next) => {
    try {
      const result = await getMediaViewUrl(db, req.user!.id, req.params.id as string);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
