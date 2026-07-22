import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@tc/contracts';
import { ApiError } from '../lib/errors.js';
import { logger } from '../logger.js';

/**
 * Global error-handling middleware (4-arg signature required by Express).
 * Mount last. Produces the envelope from plan/03-ARCHITECTURE.md §14:
 * `{ error: { code, message, details?, requestId } }`.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req.id as string | undefined) ?? randomUUID();

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error({ err, requestId }, err.message);
    }
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, details: err.details, requestId },
    };
    res.status(err.status).json(body);
    return;
  }

  logger.error({ err, requestId }, 'unhandled error');
  const body: ApiErrorBody = {
    error: {
      code: 'internal_error',
      message: 'Something went wrong',
      requestId,
    },
  };
  res.status(500).json(body);
}
