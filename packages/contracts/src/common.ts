import { z } from 'zod';

/**
 * Shared envelope shapes used by every endpoint. Feature-specific schemas
 * (auth, capsules, media, ...) are added ticket-by-ticket in their own files
 * per plan/05-BUILD-PLAYBOOK.md — do not add them here ahead of the ticket.
 */

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

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
