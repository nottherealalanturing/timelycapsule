import { CreateTagRequestSchema, PatchTagRequestSchema, PutCapsuleTagsRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { createTag, deleteTag, listTags, patchTag, putCapsuleTags } from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });

export function tagsRouter(db: Database): Router {
  const router = Router();
  router.use('/tags', requireAuth());
  router.use('/capsules', requireAuth());

  router.get('/tags', async (req, res, next) => {
    try {
      const data = await listTags(db, req.user!.id);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tags', validate({ body: CreateTagRequestSchema }), async (req, res, next) => {
    try {
      const tag = await createTag(db, req.user!.id, req.body.name);
      res.status(201).json({ tag });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tags/:id', validate({ params: IdParamSchema, body: PatchTagRequestSchema }), async (req, res, next) => {
    try {
      const tag = await patchTag(db, req.user!.id, req.params.id as string, req.body.name);
      res.status(200).json({ tag });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tags/:id', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      await deleteTag(db, req.user!.id, req.params.id as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/capsules/:id/tags',
    validate({ params: IdParamSchema, body: PutCapsuleTagsRequestSchema }),
    async (req, res, next) => {
      try {
        await putCapsuleTags(db, req.user!.id, req.params.id as string, req.body.tagIds);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
