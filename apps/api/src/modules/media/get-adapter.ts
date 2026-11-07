import { FakeStorageAdapter } from './fake-adapter.js';
import { R2StorageAdapter } from './r2-adapter.js';
import type { StorageAdapter } from './storage-adapter.js';

let cached: StorageAdapter | undefined;

/**
 * NODE_ENV=test ALWAYS gets the fake in-memory adapter, regardless of
 * whether real R2 credentials are configured in .env — otherwise running
 * the test suite would upload/delete real objects in the R2 bucket on
 * every run. Mirrors modules/email/get-adapter.ts's ConsoleEmailAdapter
 * pattern.
 */
export function getStorageAdapter(): StorageAdapter {
  if (!cached) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const endpoint = process.env.R2_ENDPOINT;
    const bucket = process.env.R2_BUCKET_MEDIA;

    if (process.env.NODE_ENV === 'production' && !(accountId && accessKeyId && secretAccessKey && endpoint && bucket)) {
      // Never fall back to the in-memory fake in production: uploads would
      // appear to succeed and then vanish on restart.
      throw new Error('Object storage is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET_MEDIA)');
    }

    cached =
      process.env.NODE_ENV !== 'test' && accountId && accessKeyId && secretAccessKey && endpoint && bucket
        ? new R2StorageAdapter({ accountId, accessKeyId, secretAccessKey, endpoint, bucket })
        : new FakeStorageAdapter();
  }
  return cached;
}

/** Test-only: reset the cached adapter so each test file gets a fresh in-memory store. */
export function resetStorageAdapterForTests(): void {
  cached = undefined;
}
