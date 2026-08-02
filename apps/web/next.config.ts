import type { NextConfig } from "next";

/**
 * Security headers (T-22 hardening pass). Next's own `headers()` — no new
 * dependency, no middleware — applied to every route.
 *
 * The CSP is the one piece that needed real auditing rather than defaults:
 * `04-ZERO-COST-PLAN.md`'s guarantee is that a recipient's uploaded file can
 * never execute as if it were same-origin script, which is why user media is
 * served from a separate origin in the first place. Every source list below
 * was checked against actual call sites, not assumed:
 *
 * - `connect-src`/`img-src`/`media-src` allow the R2 endpoint
 *   (`*.r2.cloudflarestorage.com`, from `apps/api/src/modules/media/get-adapter.ts` —
 *   the custom domain `usercontent.<domain>` is allowed too, ready for when
 *   that DNS mapping goes live per `plan/PROGRESS.md`) and `blob:` — decrypted
 *   media in `RevealCeremony.tsx`/`MediaTile` is rendered via
 *   `URL.createObjectURL()`, never fetched directly into an `<img>`.
 * - `script-src`/`frame-src` allow `accounts.google.com` —
 *   `GoogleSignInButton.tsx` injects Google's own script tag and iframe.
 * - `connect-src` allows Sentry/PostHog ingest and both real API origins
 *   (`apps/web/.env.example`'s `NEXT_PUBLIC_API_URL`, dev and production).
 * - `script-src`/`style-src` keep `'unsafe-inline'` — this Next 16/Turbopack
 *   app's RSC streaming relies on inline hydration scripts, and removing it
 *   would need a nonce-per-request wired through middleware, which is a
 *   larger change than this ticket's scope and unverifiable without a full
 *   page-by-page pass across a live instance. Every other directive is
 *   'self'-only, which is the actual XSS vector this ticket cares about: a
 *   malicious upload being treated as same-origin script.
 *
 * `Permissions-Policy` allows exactly the device APIs this app actually uses
 * — `geolocation` (`PlaceGate.tsx`'s place-seal check) and
 * `camera`/`microphone` (`MediaBlock.tsx`'s voice/video recording) — checked
 * against real call sites rather than disabled by a copy-pasted default.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://usercontent.timelycapsule.com https://*.r2.cloudflarestorage.com",
  "media-src 'self' blob: https://usercontent.timelycapsule.com https://*.r2.cloudflarestorage.com",
  [
    "connect-src 'self'",
    "http://localhost:4001",
    "https://api.timelycapsule.com",
    "https://usercontent.timelycapsule.com",
    "https://*.r2.cloudflarestorage.com",
    "https://accounts.google.com",
    "https://us.i.posthog.com",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
  ].join(' '),
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
