import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/errors.js';
import { verifyAccessToken } from './tokens.js';

/** Verifies `Authorization: Bearer <accessToken>` and populates `req.user`. */
export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next(ApiError.unauthorized('Missing bearer token'));
      return;
    }

    try {
      const payload = await verifyAccessToken(token);
      req.user = { id: payload.userId, sessionId: payload.sessionId };
      next();
    } catch {
      next(ApiError.unauthorized('Invalid or expired access token'));
    }
  };
}
