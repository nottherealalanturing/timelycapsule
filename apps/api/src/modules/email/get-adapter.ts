import { ConsoleEmailAdapter } from './adapters/console.js';
import { ResendEmailAdapter } from './adapters/resend.js';
import type { EmailAdapter } from './adapter.js';

let cached: EmailAdapter | undefined;

/**
 * NODE_ENV=test ALWAYS gets the console adapter, regardless of whether a
 * real RESEND_API_KEY is configured in .env — otherwise running the test
 * suite would fire real emails through a real provider on every run.
 */
export function getEmailAdapter(): EmailAdapter {
  if (!cached) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (process.env.NODE_ENV === 'production' && !(apiKey && from)) {
      // Never fall back to the console adapter in production: it logs the full
      // message (verification codes, reset links, addresses) instead of sending.
      // Callers treat a throw as a failed send (logged, ledger row marked failed).
      throw new Error('Email provider is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)');
    }

    cached =
      process.env.NODE_ENV !== 'test' && apiKey && from
        ? new ResendEmailAdapter(apiKey, from)
        : new ConsoleEmailAdapter();
  }
  return cached;
}
