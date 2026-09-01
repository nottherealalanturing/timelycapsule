import { describe, expect, it, vi } from 'vitest';

// Same react-native/expo-secure-store mocks api-client.test.ts needs — this
// file's real import of api-error-copy.ts transitively pulls in api-client.ts.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

const { ApiClientError } = await import('./api-client');
const { describeCapsulePatchFailure, describeRecipientFailure, describeEncloseFailure } = await import('./api-error-copy');

function err(code: string, message = 'server message', status = 400) {
  return new ApiClientError(code, message, status);
}

describe('describeCapsulePatchFailure', () => {
  it('states capsule_sealed exactly as use-capsule-compose.ts already established', () => {
    expect(describeCapsulePatchFailure(err('capsule_sealed'))).toBe(
      'This capsule has already been sealed and can no longer be edited.',
    );
  });

  it('states unlock_in_past specifically, covering both bound directions in one message', () => {
    const message = describeCapsulePatchFailure(err('unlock_in_past'));
    expect(message).toMatch(/five minutes/);
    expect(message).toMatch(/fifty years/);
  });

  it('states validation_failed specifically, distinct from a network problem', () => {
    expect(describeCapsulePatchFailure(err('validation_failed'))).toBe(
      "That couldn't be saved — something about it wasn't valid. Try again.",
    );
  });

  it('falls back to the network-flavored message for a plain Error or an unmapped code', () => {
    expect(describeCapsulePatchFailure(new Error('network down'))).toBe("That couldn't be saved. Check your connection and try again.");
    expect(describeCapsulePatchFailure(err('some_new_code'))).toBe("That couldn't be saved. Check your connection and try again.");
  });
});

describe('describeRecipientFailure', () => {
  it('states recipient_already_added exactly as already established', () => {
    expect(describeRecipientFailure(err('recipient_already_added'), 'add')).toBe('That recipient is already added.');
  });

  it('states quota_exceeded as the per-capsule recipient limit, not the storage one', () => {
    expect(describeRecipientFailure(err('quota_exceeded'), 'add')).toBe('This capsule already has as many recipients as this plan allows.');
  });

  it('reuses the server\'s own velocity_limit_exceeded message verbatim rather than duplicating it', () => {
    expect(describeRecipientFailure(err('velocity_limit_exceeded', 'Too many recipients added today — try again tomorrow'), 'add')).toBe(
      'Too many recipients added today — try again tomorrow',
    );
  });

  it('states recipient_locked specifically', () => {
    expect(describeRecipientFailure(err('recipient_locked'), 'remove')).toBe('Recipients can only be changed before this capsule opens.');
  });

  it('states not_found differently for add vs. remove', () => {
    expect(describeRecipientFailure(err('not_found'), 'add')).toBe("This capsule couldn't be found.");
    expect(describeRecipientFailure(err('not_found'), 'remove')).toBe('That recipient is already gone.');
  });

  it('falls back to the existing generic message per action for a plain Error or an unmapped code', () => {
    expect(describeRecipientFailure(new Error('network down'), 'add')).toBe('That recipient could not be added.');
    expect(describeRecipientFailure(new Error('network down'), 'remove')).toBe('That recipient could not be removed.');
    expect(describeRecipientFailure(err('some_new_code'), 'add')).toBe('That recipient could not be added.');
  });
});

describe('describeEncloseFailure', () => {
  it('states file_too_large specifically and non-retryable', () => {
    expect(describeEncloseFailure(err('file_too_large'))).toEqual({
      message: 'This file is larger than this plan allows.',
      retryable: false,
    });
  });

  it('states unsupported_media_type specifically and non-retryable', () => {
    expect(describeEncloseFailure(err('unsupported_media_type'))).toEqual({
      message: "This kind of file isn't supported yet.",
      retryable: false,
    });
  });

  it('states quota_exceeded as storage, not the recipient limit, and non-retryable', () => {
    expect(describeEncloseFailure(err('quota_exceeded'))).toEqual({
      message: "You're out of storage on this plan.",
      retryable: false,
    });
  });

  it('states capsule_sealed specifically and non-retryable', () => {
    expect(describeEncloseFailure(err('capsule_sealed'))).toEqual({
      message: 'This capsule has already been sealed and can no longer be edited.',
      retryable: false,
    });
  });

  it('falls back to the exact existing generic-but-retryable message for a plain Error or an unmapped code', () => {
    expect(describeEncloseFailure(new Error('network down'))).toEqual({ message: 'Stopped before it finished', retryable: true });
    expect(describeEncloseFailure(err('some_new_code'))).toEqual({ message: 'Stopped before it finished', retryable: true });
  });
});
