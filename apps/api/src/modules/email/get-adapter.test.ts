import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEmailAdapter } from './get-adapter.js';

// getEmailAdapter caches only after a successful selection, so a throw leaves nothing behind.
afterEach(() => vi.unstubAllEnvs());

describe('email adapter selection', () => {
  it('throws in production without RESEND_* (instead of logging messages to the console)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    expect(() => getEmailAdapter()).toThrow(/not configured/);
  });

  it('keeps the console adapter outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(getEmailAdapter()).toBeDefined();
  });
});
