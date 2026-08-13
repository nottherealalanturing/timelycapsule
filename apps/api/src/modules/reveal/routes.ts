import {
  PlaceCheckRequestSchema,
  RemindRequestSchema,
  ReportRequestSchema,
  TzInferRequestSchema,
  VerifyIdentityRequestSchema,
} from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import {
  confirmRead,
  getReveal,
  inferTimezone,
  placeCheck,
  report,
  requestIdentityCode,
  saveToAccount,
  setReminderOptIn,
  verifyIdentityCode,
} from './service.js';

const TokenParamsSchema = z.object({ token: z.string().min(1) });
const GateQuerySchema = z.object({ placeGate: z.string().optional(), identityGate: z.string().optional() });

export function revealRouter(db: Database): Router {
  const router = Router();

  router.get('/r/:token', validate({ params: TokenParamsSchema, query: GateQuerySchema }), async (req, res, next) => {
    try {
      const query = (req as unknown as { validatedQuery: { placeGate?: string; identityGate?: string } }).validatedQuery;
      const result = await getReveal(db, req.params.token as string, { place: query.placeGate, identity: query.identityGate });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/r/:token/verify/request',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyFn: (r) => String(r.params.token) }),
    validate({ params: TokenParamsSchema }),
    async (req, res, next) => {
      try {
        await requestIdentityCode(db, req.params.token as string);
        res.status(200).json({ sent: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/r/:token/verify',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (r) => String(r.params.token) }),
    validate({ params: TokenParamsSchema, body: VerifyIdentityRequestSchema }),
    async (req, res, next) => {
      try {
        const gateToken = await verifyIdentityCode(db, req.params.token as string, req.body.code);
        res.status(200).json({ gateToken });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/r/:token/place-check',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (r) => String(r.params.token) }),
    validate({ params: TokenParamsSchema, body: PlaceCheckRequestSchema }),
    async (req, res, next) => {
    try {
      const result = await placeCheck(db, req.params.token as string, req.body.lat, req.body.lng);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/r/:token/confirm-read',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (r) => String(r.params.token) }),
    validate({ params: TokenParamsSchema }),
    async (req, res, next) => {
      try {
        await confirmRead(db, req.params.token as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/r/:token/remind', validate({ params: TokenParamsSchema, body: RemindRequestSchema }), async (req, res, next) => {
    try {
      await setReminderOptIn(db, req.params.token as string, req.body.enabled);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/r/:token/report', validate({ params: TokenParamsSchema, body: ReportRequestSchema }), async (req, res, next) => {
    try {
      await report(db, req.params.token as string, req.body);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/r/:token/tz-infer', validate({ params: TokenParamsSchema, body: TzInferRequestSchema }), async (req, res, next) => {
    try {
      await inferTimezone(db, req.params.token as string, req.body.tz);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Auth'd — claiming a capsule into the visitor's own account (T-05's ghost-claim pattern).
  router.post('/r/:token/save', requireAuth(), validate({ params: TokenParamsSchema }), async (req, res, next) => {
    try {
      await saveToAccount(db, req.params.token as string, req.user!.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
