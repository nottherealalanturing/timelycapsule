import * as Sentry from '@sentry/nextjs';

/**
 * Manual Sentry wiring (no `withSentryConfig` build-plugin wrapper) — that
 * plugin's only real job beyond `Sentry.init()` is uploading source maps via
 * a `SENTRY_AUTH_TOKEN`, which T-20 hasn't collected. Plain error capture
 * (this file + instrumentation-client.ts) doesn't need it; wiring the
 * source-map/release plugin is a follow-up refinement, not required for the
 * DoD ("Sentry wired").
 */
export function register(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Cloudflare Workers run the Next.js server under NEXT_RUNTIME=nodejs
    // (via the `nodejs_compat` flag in wrangler.jsonc) rather than 'edge' —
    // both branches exist so this still behaves correctly if a future
    // change ever routes part of the app through Next's edge runtime.
    environment: process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'server',
  });
}

export const onRequestError = Sentry.captureRequestError;
