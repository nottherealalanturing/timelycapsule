import { CreateBlockRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { createBlock, deleteBlock, listBlocks } from './blocks-service.js';

const EmailParamSchema = z.object({ email: z.string().email() });

export function blocksRouter(db: Database): Router {
  const router = Router();
  router.use('/blocks', requireAuth());

  router.get('/blocks', async (req, res, next) => {
    try {
      const data = await listBlocks(db, req.user!.id);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/blocks', validate({ body: CreateBlockRequestSchema }), async (req, res, next) => {
    try {
      const block = await createBlock(db, req.user!.id, req.body.email);
      res.status(201).json({ block });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/blocks/:email', validate({ params: EmailParamSchema }), async (req, res, next) => {
    try {
      await deleteBlock(db, req.user!.id, req.params.email as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
