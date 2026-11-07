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

  // Expired buckets used to stay in the Map until restart, so keys that never
  // return (rotating IPs, guest-session ids) grew memory without bound.
  // Sweep them; unref() so the timer never keeps the process alive.
  const sweep = setInterval(
    () => {
      const cutoff = Date.now() - options.windowMs;
      for (const [k, b] of buckets) if (b.windowStart <= cutoff) buckets.delete(k);
    },
    Math.max(options.windowMs, 60_000),
  );
  sweep.unref();

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
