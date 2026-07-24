import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { Database } from '../db/client.js';
import { idempotencyKeys } from '../db/schema/index.js';
import { ApiError } from '../lib/errors.js';

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

/**
 * Table-backed Idempotency-Key handling (plan/00-INDEX.md rule #6). Only
 * activates when the header is present — callers that don't send it get
 * no idempotency guarantee, matching "honored", not "required".
 *
 * userId comes from `req.user?.id` once auth middleware (T-04) populates
 * it; until then every row is anonymous (see schema/system.ts comment on
 * the uniqueness caveat this implies).
 */
export function idempotency(db: Database) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('Idempotency-Key');
    if (!key) {
      next();
      return;
    }

    const userId = req.user?.id;
    const requestHash = hashBody(req.body);
    const method = req.method;
    const path = req.path;

    const whereClause = userId
      ? and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.method, method),
          eq(idempotencyKeys.path, path),
          eq(idempotencyKeys.userId, userId),
        )
      : and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.method, method),
          eq(idempotencyKeys.path, path),
        );

    const [existing] = await db.select().from(idempotencyKeys).where(whereClause).limit(1);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        next(
          ApiError.idempotencyConflict(
            'This Idempotency-Key was already used with a different request body',
          ),
        );
        return;
      }
      if (existing.status === 'completed') {
        res.status(existing.responseStatus ?? 200).json(existing.responseBody);
        return;
      }
      next(
        ApiError.idempotencyConflict('A request with this Idempotency-Key is already in progress'),
      );
      return;
    }

    let row: typeof idempotencyKeys.$inferSelect | undefined;
    try {
      [row] = await db
        .insert(idempotencyKeys)
        .values({ key, method, path, userId, requestHash })
        .returning();
    } catch (err) {
      // Unique violation (Postgres 23505): a concurrent request with the
      // same key won the race to insert first.
      if ((err as { code?: string }).code === '23505') {
        next(
          ApiError.idempotencyConflict(
            'A request with this Idempotency-Key is already in progress',
          ),
        );
        return;
      }
      throw err;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (row) {
        void db
          .update(idempotencyKeys)
          .set({ status: 'completed', responseStatus: res.statusCode, responseBody: body, completedAt: new Date() })
          .where(eq(idempotencyKeys.id, row.id))
          .catch(() => {
            // best-effort: a failure here just means this key won't replay next time
          });
      }
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}
