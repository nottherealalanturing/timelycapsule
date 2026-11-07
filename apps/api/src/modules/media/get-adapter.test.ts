import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStorageAdapter, resetStorageAdapterForTests } from './get-adapter.js';

afterEach(() => {
  vi.unstubAllEnvs();
  resetStorageAdapterForTests();
});

describe('storage adapter selection', () => {
  it('throws in production without R2_* (instead of an in-memory fake)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_MEDIA']) vi.stubEnv(k, '');
    expect(() => getStorageAdapter()).toThrow(/not configured/);
  });

  it('keeps the fake adapter outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(getStorageAdapter()).toBeDefined();
  });
});
