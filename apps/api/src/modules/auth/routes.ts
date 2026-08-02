import {
  ChangeEmailRequestSchema,
  ChangePasswordRequestSchema,
  SetInitialPasswordRequestSchema,
  ConfirmEmailChangeRequestSchema,
  ForgotPasswordRequestSchema,
  GoogleOAuthRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  PatchMeRequestSchema,
  RefreshRequestSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  VerifyEmailRequestSchema,
} from '@tc/contracts';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from './middleware.js';
import { listActiveSessions, revokeSession, type DeviceMeta } from './sessions.js';
import * as service from './service.js';

function deviceMeta(req: Request): DeviceMeta {
  const platform = req.header('X-Platform');
  return {
    platform: platform === 'ios' || platform === 'android' ? platform : 'web',
    ip: req.ip ?? null,
    userAgent: req.header('User-Agent') ?? null,
    deviceName: req.header('X-Device-Name') ?? null,
  };
}

const IdParamSchema = z.object({ id: z.string().uuid() });

export function authRouter(db: Database): Router {
  const router = Router();

  router.post(
    '/auth/signup',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }),
    validate({ body: SignupRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await service.signup(db, req.body, deviceMeta(req));
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
    validate({ body: LoginRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await service.login(db, req.body, deviceMeta(req));
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/oauth/google',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
    validate({ body: GoogleOAuthRequestSchema }),
    async (req, res, next) => {
      try {
        const { created, user, tokens } = await service.googleOAuth(db, req.body.idToken, deviceMeta(req), undefined, req.body.guestToken);
        res.status(created ? 201 : 200).json({ user, tokens });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/refresh',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }),
    validate({ body: RefreshRequestSchema }),
    async (req, res, next) => {
      try {
        const result = await service.refresh(db, req.body.refreshToken);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/logout',
    requireAuth(),
    validate({ body: LogoutRequestSchema }),
    async (req, res, next) => {
      try {
        await service.logout(db, req.user!.id, req.user!.sessionId);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/verify-email',
    requireAuth(),
    // T-22 hardening: this route had no HTTP-level rate limit — only a
    // per-code attempt-burn (service.verifyEmail burns a code after 5 wrong
    // guesses). That bounds guesses per code, but not the raw request rate
    // against the endpoint itself, unlike every other auth mutation route.
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: VerifyEmailRequestSchema }),
    async (req, res, next) => {
      try {
        const user = await service.verifyEmail(db, req.user!.id, req.body.code);
        res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/verify-email/resend',
    requireAuth(),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    async (req, res, next) => {
      try {
        await service.resendVerifyEmail(db, req.user!.id);
        res.status(202).json({});
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/password/forgot',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }),
    validate({ body: ForgotPasswordRequestSchema }),
    async (req, res, next) => {
      try {
        await service.forgotPassword(db, req.body.email);
        res.status(200).json({});
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/password/reset',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
    validate({ body: ResetPasswordRequestSchema }),
    async (req, res, next) => {
      try {
        await service.resetPassword(db, req.body.token, req.body.newPassword);
        res.status(200).json({});
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/auth/sessions', requireAuth(), async (req, res, next) => {
    try {
      const rows = await listActiveSessions(db, req.user!.id);
      res.status(200).json({
        data: rows.map((s) => ({
          id: s.id,
          deviceName: s.deviceName,
          platform: s.platform,
          ip: s.ip,
          userAgent: s.userAgent,
          lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          current: s.id === req.user!.sessionId,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete(
    '/auth/sessions/:id',
    requireAuth(),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        await revokeSession(db, req.user!.id, req.params.id as string);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/me', requireAuth(), async (req, res, next) => {
    try {
      const user = await service.getMe(db, req.user!.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/me',
    requireAuth(),
    validate({ body: PatchMeRequestSchema }),
    async (req, res, next) => {
      try {
        const user = await service.patchMe(db, req.user!.id, req.body);
        res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/password/change',
    requireAuth(),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: ChangePasswordRequestSchema }),
    async (req, res, next) => {
      try {
        await service.changePassword(db, req.user!.id, req.user!.sessionId, req.body);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/auth/password/set-initial',
    requireAuth(),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: SetInitialPasswordRequestSchema }),
    async (req, res, next) => {
      try {
        const user = await service.setInitialPassword(db, req.user!.id, req.body);
        res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/me/email/change',
    requireAuth(),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyFn: (r) => r.user?.id ?? (r.ip ?? 'unknown') }),
    validate({ body: ChangeEmailRequestSchema }),
    async (req, res, next) => {
      try {
        await service.requestEmailChange(db, req.user!.id, req.body.newEmail, req.body.currentPassword);
        res.status(202).json({});
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/me/email/confirm',
    requireAuth(),
    validate({ body: ConfirmEmailChangeRequestSchema }),
    async (req, res, next) => {
      try {
        const user = await service.confirmEmailChange(db, req.user!.id, req.body.code);
        res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
