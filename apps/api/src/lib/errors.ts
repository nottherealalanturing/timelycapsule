import type { ErrorCode } from '@tc/contracts';

/**
 * Throw this anywhere in a route/service; error-handler middleware (see
 * middleware/error-handler.ts) catches it and produces the standard
 * envelope from plan/03-ARCHITECTURE.md §14.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static validationFailed(details: unknown): ApiError {
    return new ApiError('validation_failed', 'Request validation failed', 400, details);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError('not_found', message, 404);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError('unauthorized', message, 401);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError('forbidden', message, 403);
  }

  static rateLimited(retryAfterSeconds: number): ApiError {
    return new ApiError('rate_limited', 'Too many requests', 429, {
      retryAfter: retryAfterSeconds,
    });
  }

  static idempotencyConflict(message: string): ApiError {
    return new ApiError('idempotency_conflict', message, 409);
  }

  static emailAlreadyRegistered(): ApiError {
    return new ApiError('email_already_registered', 'Email is already registered', 409);
  }

  static invalidCredentials(): ApiError {
    return new ApiError('invalid_credentials', 'Invalid email or password', 401);
  }

  static emailNotVerified(): ApiError {
    return new ApiError('email_not_verified', 'Email address is not verified', 403);
  }

  static invalidOrExpiredCode(message = 'Invalid or expired code'): ApiError {
    return new ApiError('invalid_or_expired_code', message, 400);
  }

  static capsuleSealed(message = 'Capsule is sealed and cannot be edited'): ApiError {
    return new ApiError('capsule_sealed', message, 409);
  }

  static capsuleWithdrawn(message = 'Capsule has been withdrawn'): ApiError {
    return new ApiError('capsule_withdrawn', message, 409);
  }

  static unlockInPast(message = 'Unlock time is invalid'): ApiError {
    return new ApiError('unlock_in_past', message, 422);
  }

  static quotaExceeded(limit: string): ApiError {
    return new ApiError('quota_exceeded', `Plan limit reached: ${limit}`, 403, { limit });
  }

  static planRequired(feature: string): ApiError {
    return new ApiError('plan_required', `This feature requires a paid plan: ${feature}`, 403, { feature });
  }

  static uploadIncomplete(message = 'Media is still uploading or processing'): ApiError {
    return new ApiError('upload_incomplete', message, 409);
  }
}
