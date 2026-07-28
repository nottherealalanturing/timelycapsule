import type { NextFunction, Request, Response } from 'express';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { findGuestSessionOrThrow } from './service.js';

/** Verifies `Authorization: Bearer <guestToken>` and populates `req.guestSession`. */
export function requireGuestSession(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next(ApiError.unauthorized('Missing bearer guest token'));
      return;
    }

    try {
      const session = await findGuestSessionOrThrow(db, token);
      req.guestSession = { id: session.id };
      next();
    } catch (err) {
      next(err);
    }
  };
}
