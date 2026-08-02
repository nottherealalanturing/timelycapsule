import {
  AddCollectionItemRequestSchema,
  CreateCollectionRequestSchema,
  PatchCollectionRequestSchema,
  ReorderCollectionItemsRequestSchema,
} from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import {
  addCollectionItem,
  createCollection,
  deleteCollection,
  listCollections,
  patchCollection,
  removeCollectionItem,
  reorderCollectionItems,
} from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });
const ItemParamsSchema = z.object({ id: z.string().uuid(), capsuleId: z.string().uuid() });

export function collectionsRouter(db: Database): Router {
  const router = Router();
  router.use('/collections', requireAuth());

  router.get('/collections', async (req, res, next) => {
    try {
      const data = await listCollections(db, req.user!.id);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/collections',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: CreateCollectionRequestSchema }),
    async (req, res, next) => {
      try {
        const collection = await createCollection(db, req.user!.id, req.body);
        res.status(201).json({ collection });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/collections/:id',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema, body: PatchCollectionRequestSchema }),
    async (req, res, next) => {
      try {
        const collection = await patchCollection(db, req.user!.id, req.params.id as string, req.body);
        res.status(200).json({ collection });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/collections/:id',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        await deleteCollection(db, req.user!.id, req.params.id as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/collections/:id/items',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema, body: AddCollectionItemRequestSchema }),
    async (req, res, next) => {
      try {
        await addCollectionItem(db, req.user!.id, req.params.id as string, req.body.capsuleId);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    '/collections/:id/items',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: IdParamSchema, body: ReorderCollectionItemsRequestSchema }),
    async (req, res, next) => {
      try {
        await reorderCollectionItems(db, req.user!.id, req.params.id as string, req.body.capsuleIds);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/collections/:id/items/:capsuleId',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ params: ItemParamsSchema }),
    async (req, res, next) => {
      try {
        await removeCollectionItem(db, req.user!.id, req.params.id as string, req.params.capsuleId as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
