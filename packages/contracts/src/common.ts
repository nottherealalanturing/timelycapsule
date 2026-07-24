import { z } from 'zod';

/**
 * Shared envelope shapes used by every endpoint. Feature-specific schemas
 * (auth, capsules, media, ...) are added ticket-by-ticket in their own files
 * per plan/05-BUILD-PLAYBOOK.md — do not add them here ahead of the ticket.
 */

/**
 * Known error codes (plan/03-ARCHITECTURE.md §14). This is the subset that
 * exists as of T-03; feature tickets add their own (e.g. `capsule_sealed`
 * lands with T-08) rather than this list being exhaustive up front.
 */
export const ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'idempotency_conflict',
  'internal_error',
  // T-04 auth
  'email_already_registered',
  'invalid_credentials',
  'email_not_verified',
  'invalid_or_expired_code',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export const PaginatedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginatedQuery = z.infer<typeof PaginatedQuerySchema>;

export function paginatedResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const SystemTimeResponseSchema = z.object({
  serverTime: z.string(),
});
export type SystemTimeResponse = z.infer<typeof SystemTimeResponseSchema>;
