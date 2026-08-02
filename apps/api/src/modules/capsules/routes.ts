import {
  CreateCapsuleRequestSchema,
  ExtendCapsuleRequestSchema,
  ListCapsulesQuerySchema,
  PatchCapsuleRequestSchema,
  SetOwnerKeyWrapRequestSchema,
} from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { idempotency } from '../../middleware/idempotency.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import {
  extendCapsule,
  getCapsuleActivity,
  purgeCapsule,
  restoreCapsule,
  sealCapsule,
  trashCapsule,
  withdrawCapsule,
} from './lifecycle.js';
import {
  archiveCapsule,
  createCapsule,
  duplicateCapsule,
  getCapsule,
  listCapsules,
  patchCapsule,
  setOwnerKeyWrap,
  unarchiveCapsule,
} from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });

export function capsulesRouter(db: Database): Router {
  const router = Router();
  router.use('/capsules', requireAuth());

  router.post(
    '/capsules',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: CreateCapsuleRequestSchema }),
    async (req, res, next) => {
      try {
        const capsule = await createCapsule(db, req.user!.id, req.body);
        res.status(201).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/capsules', validate({ query: ListCapsulesQuerySchema }), async (req, res, next) => {
    try {
      const query = (req as unknown as { validatedQuery: z.infer<typeof ListCapsulesQuerySchema> }).validatedQuery;
      const page = await listCapsules(db, req.user!.id, query);
      res.status(200).json(page);
    } catch (err) {
      next(err);
    }
  });

  router.get('/capsules/:id', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      const capsule = await getCapsule(db, req.user!.id, req.params.id as string);
      res.status(200).json({ capsule });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/capsules/:id/owner-key-wrap',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema, body: SetOwnerKeyWrapRequestSchema }),
    async (req, res, next) => {
      try {
        const capsule = await setOwnerKeyWrap(db, req.user!.id, req.params.id as string, req.body.ownerKeyWrap);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/capsules/:id',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema, body: PatchCapsuleRequestSchema }),
    async (req, res, next) => {
      try {
        const capsule = await patchCapsule(db, req.user!.id, req.params.id as string, req.body);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/seal',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await sealCapsule(db, req.user!.id, req.params.id as string);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/duplicate',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await duplicateCapsule(db, req.user!.id, req.params.id as string);
        res.status(201).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/archive',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await archiveCapsule(db, req.user!.id, req.params.id as string);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/unarchive',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await unarchiveCapsule(db, req.user!.id, req.params.id as string);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/trash',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await trashCapsule(db, req.user!.id, req.params.id as string);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/restore',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await restoreCapsule(db, req.user!.id, req.params.id as string);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/withdraw',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsule = await withdrawCapsule(db, req.user!.id, req.params.id as string);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/extend',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema, body: ExtendCapsuleRequestSchema }),
    async (req, res, next) => {
      try {
        const capsule = await extendCapsule(db, req.user!.id, req.params.id as string, req.body);
        res.status(200).json({ capsule });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/capsules/:id/purge',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    idempotency(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        await purgeCapsule(db, req.user!.id, req.params.id as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/capsules/:id/activity', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      const activity = await getCapsuleActivity(db, req.user!.id, req.params.id as string);
      res.status(200).json(activity);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
