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

  static recipientAlreadyAdded(message = 'This recipient has already been added to this capsule'): ApiError {
    return new ApiError('recipient_already_added', message, 409);
  }

  static recipientLocked(message = 'Recipients can only be edited before the capsule unlocks'): ApiError {
    return new ApiError('recipient_locked', message, 409);
  }

  static unsupportedMediaType(mime: string): ApiError {
    return new ApiError('unsupported_media_type', `Unsupported media type: ${mime}`, 415, { mime });
  }

  static fileTooLarge(limitBytes: number): ApiError {
    return new ApiError('file_too_large', `File exceeds the plan's per-file size limit`, 413, { limitBytes });
  }

  static announceNotAllowed(message = 'This capsule is not sealed or announce-on-seal is disabled'): ApiError {
    return new ApiError('announce_not_allowed', message, 409);
  }

  static sealNotSatisfied(sealType: string): ApiError {
    return new ApiError('seal_not_satisfied', `The ${sealType} seal hasn't been satisfied yet`, 403, { sealType });
  }

  static alreadySaved(): ApiError {
    return new ApiError('already_saved', 'This capsule has already been saved to a different account', 409);
  }

  static guestSessionInvalid(message = 'Guest session not found or already claimed'): ApiError {
    return new ApiError('guest_session_invalid', message, 401);
  }

  static guestCapsuleLimit(message = 'One capsule per guest session — sign up free for more'): ApiError {
    return new ApiError('guest_capsule_limit', message, 409);
  }

  static guestCapsuleLocked(message = 'This capsule can no longer be edited'): ApiError {
    return new ApiError('guest_capsule_locked', message, 409);
  }

  static ownerKeyWrapAlreadySet(): ApiError {
    return new ApiError('owner_key_wrap_already_set', 'This capsule already has an owner key wrap', 409);
  }

  static tagAlreadyExists(): ApiError {
    return new ApiError('tag_already_exists', 'A tag with this name already exists', 409);
  }

  static passwordAlreadySet(): ApiError {
    return new ApiError('password_already_set', 'This account already has a password — use change password instead', 409);
  }
}
