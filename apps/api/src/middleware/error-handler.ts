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
  // `String(...)` rather than a cast, because `pino-http` assigns `req.id` an
  // auto-incrementing **number**. The previous `req.id as string` asserted a
  // type the value never had, so TypeScript could not see the mismatch and
  // every error response went out with a numeric `requestId` — against
  // `ApiErrorSchema`, which declares it a string.
  //
  // The web client parses that schema with `safeParse` and, on failure, falls
  // back to `ApiClientError('internal_error', 'Something went wrong')`. So the
  // mismatch silently discarded the real `code` and `message` from *every*
  // error the API has ever returned: a guest hitting the one-capsule limit,
  // a plan quota, a still-uploading enclosure and a genuine 500 all reached
  // the user as the same four words, with the actionable part thrown away.
  const requestId = req.id != null ? String(req.id) : randomUUID();

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
