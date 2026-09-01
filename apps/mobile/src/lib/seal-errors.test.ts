import { describe, expect, it, vi } from 'vitest';

// Same react-native/expo-secure-store mocks api-client.test.ts needs, for the
// same reason: this file's real import of seal-errors.ts transitively pulls
// in api-client.ts (Platform, token-store -> expo-secure-store).
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

const { ApiClientError } = await import('./api-client');
const { describeSealFailure } = await import('./seal-errors');

function err(code: string, message = 'boom', status = 409) {
  return new ApiClientError(code, message, status);
}

describe('describeSealFailure', () => {
  it('maps upload_incomplete to a retryable, non-address problem', () => {
    const problem = describeSealFailure(err('upload_incomplete'));
    expect(problem.retryable).toBe(true);
    expect(problem.goToAddress).toBeUndefined();
    expect(problem.message).toMatch(/enclosed/i);
  });

  it('maps quota_exceeded to a non-retryable problem', () => {
    const problem = describeSealFailure(err('quota_exceeded'));
    expect(problem.retryable).toBe(false);
    expect(problem.goToAddress).toBeUndefined();
  });

  it('maps capsule_sealed to a non-retryable, already-done problem', () => {
    const problem = describeSealFailure(err('capsule_sealed'));
    expect(problem.retryable).toBe(false);
    expect(problem.goToAddress).toBeUndefined();
    expect(problem.message).toMatch(/already sealed/i);
  });

  it('maps capsule_withdrawn to a non-retryable problem', () => {
    const problem = describeSealFailure(err('capsule_withdrawn'));
    expect(problem.retryable).toBe(false);
    expect(problem.goToAddress).toBeUndefined();
  });

  it('maps unlock_in_past to a non-retryable problem that sends the writer back to Address', () => {
    const problem = describeSealFailure(err('unlock_in_past'));
    expect(problem.retryable).toBe(false);
    expect(problem.goToAddress).toBe(true);
  });

  it('maps validation_failed to the same Address-bound problem as unlock_in_past', () => {
    const problem = describeSealFailure(err('validation_failed'));
    expect(problem.retryable).toBe(false);
    expect(problem.goToAddress).toBe(true);
  });

  it('falls back to a retryable problem carrying the server message for an unmapped code', () => {
    const problem = describeSealFailure(err('some_new_backend_code', 'A very specific server message.'));
    expect(problem.retryable).toBe(true);
    expect(problem.goToAddress).toBeUndefined();
    expect(problem.message).toBe('A very specific server message.');
  });

  it('falls back to the generic message when an unmapped ApiClientError has no message', () => {
    const problem = describeSealFailure(err('some_new_backend_code', ''));
    expect(problem.message).toMatch(/could not be sealed/i);
  });

  it('returns the generic, retryable problem for a network error (fetch threw, not an ApiClientError-coded response)', () => {
    const problem = describeSealFailure(new TypeError('Failed to fetch'));
    expect(problem.retryable).toBe(true);
    expect(problem.goToAddress).toBeUndefined();
    expect(problem.message).toMatch(/could not be sealed/i);
  });

  it('returns the generic problem for a non-Error thrown value', () => {
    const problem = describeSealFailure('a string, not an Error');
    expect(problem.retryable).toBe(true);
  });
});
