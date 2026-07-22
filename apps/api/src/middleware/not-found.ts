import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';

/** Mounted after all routes — anything unmatched becomes a standard 404 envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`));
}
