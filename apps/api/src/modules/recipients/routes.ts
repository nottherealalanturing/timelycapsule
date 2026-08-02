import { CreateRecipientRequestSchema, PatchRecipientRequestSchema, SendAnnounceRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { idempotency } from '../../middleware/idempotency.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { createRecipient, deleteRecipient, listRecipients, patchRecipient, resendInvite, sendAnnounce } from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });
const RecipientParamsSchema = z.object({ id: z.string().uuid(), rid: z.string().uuid() });

export function recipientsRouter(db: Database): Router {
  const router = Router();
  router.use('/capsules', requireAuth());

  router.get('/capsules/:id/recipients', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      const data = await listRecipients(db, req.user!.id, req.params.id as string);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/capsules/:id/recipients',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema, body: CreateRecipientRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await createRecipient(db, req.user!.id, req.params.id as string, req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/capsules/:id/recipients/:rid',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: RecipientParamsSchema, body: PatchRecipientRequestSchema }),
    async (req, res, next) => {
      try {
        const recipient = await patchRecipient(db, req.user!.id, req.params.id as string, req.params.rid as string, req.body);
        res.status(200).json({ recipient });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/capsules/:id/recipients/:rid',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: RecipientParamsSchema }),
    async (req, res, next) => {
      try {
        await deleteRecipient(db, req.user!.id, req.params.id as string, req.params.rid as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/recipients/:rid/resend-invite',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: RecipientParamsSchema, body: SendAnnounceRequestSchema }),
    async (req, res, next) => {
      try {
        await resendInvite(db, req.user!.id, req.params.id as string, req.params.rid as string, req.body.link);
        res.status(202).json({});
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/recipients/:rid/announce',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: RecipientParamsSchema, body: SendAnnounceRequestSchema }),
    async (req, res, next) => {
      try {
        await sendAnnounce(db, req.user!.id, req.params.id as string, req.params.rid as string, req.body.link);
        res.status(202).json({});
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
