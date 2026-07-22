import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../lib/errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Parses req.body/params/query against the given Zod schemas, replacing
 * each with the parsed (and coerced/defaulted) value. On failure, throws
 * `validation_failed` (400) with Zod's flattened issue list as `details`.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        // Express 5's req.query is a getter-only object; store the parsed
        // result separately rather than reassigning.
        (req as Request & { validatedQuery?: unknown }).validatedQuery = schemas.query.parse(
          req.query,
        );
      }
      next();
    } catch (err) {
      const zodError = err as { flatten?: () => unknown };
      next(ApiError.validationFailed(zodError.flatten ? zodError.flatten() : String(err)));
    }
  };
}
