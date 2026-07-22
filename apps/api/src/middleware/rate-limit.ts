import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Defaults to the client IP; override to key by something else (e.g. user id). */
  keyFn?: (req: Request) => string;
}

/**
 * Per-IP token bucket, in-memory (plan/04-ZERO-COST-PLAN.md — no Redis at
 * this scale; single API instance makes in-memory state correct). Buckets
 * reset on a fixed window rather than a sliding one — simpler, and good
 * enough for abuse-prevention purposes at this stage.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (options.keyFn ?? ((r) => r.ip ?? 'unknown'))(req);
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    const resetSeconds = Math.ceil((bucket.windowStart + options.windowMs - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (bucket.count > options.max) {
      next(ApiError.rateLimited(resetSeconds));
      return;
    }

    next();
  };
}
