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
  // T-08 capsules
  'capsule_sealed',
  'capsule_withdrawn',
  'unlock_in_past',
  'quota_exceeded',
  'plan_required',
  'upload_incomplete',
  // T-09 recipients
  'recipient_already_added',
  'recipient_locked',
  // T-10 media
  'unsupported_media_type',
  'file_too_large',
  // M4 storage lifecycle — the encrypted bytes were reclaimed; the record remains.
  'media_released',
  // T-14 notifications
  'announce_not_allowed',
  // T-15 reveal
  'seal_not_satisfied',
  'gate_expired',
  'already_saved',
  // T-15b guest mode
  'guest_session_invalid',
  'guest_capsule_limit',
  'guest_capsule_locked',
  'owner_key_wrap_already_set',
  // M5 — guest media
  'guest_quota_exceeded',
  // T-17 organization
  'tag_already_exists',
  // T-20 (production bug fix) OAuth-only accounts setting a first password
  'password_already_set',
  // T-22 hardening — sender velocity limit
  'velocity_limit_exceeded',
  // Product quality pass (2026-08) — reverse geocoding
  'geocoding_unavailable',
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
