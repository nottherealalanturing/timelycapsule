import posthog from 'posthog-js';

/**
 * The plan's hard privacy rule (03-ARCHITECTURE §19, "content-blind"): event
 * properties may only ever be structural metadata — booleans, counts,
 * enums — never anything a user typed (no capsule title, letter text,
 * recipient name/email, tag names, etc). If a value came from a text input
 * anywhere in the composer, it does not belong in an event property.
 */
type EventProps = Record<string, string | number | boolean | undefined>;

/** Activation funnel per 03-ARCHITECTURE §19: signup -> composer_opened -> content_added -> schedule_set -> capsule_sealed (activation event). */
export type AnalyticsEvent =
  | 'signup_completed'
  | 'composer_opened'
  | 'content_added'
  | 'schedule_set'
  | 'capsule_sealed';

export function initAnalytics(): void {
  if (typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    // Cookie-less per the T-20 ticket text: no cross-site cookie, no
    // consent banner needed since nothing personally-identifying is set.
    persistence: 'localStorage',
    // Pageviews are sent manually (see capturePageview, wired from
    // instrumentation-client.ts's onRouterTransitionStart) instead of
    // PostHog's own history-API patching, to avoid double-counting.
    capture_pageview: false,
    // Autocapture reads DOM text/attribute values, which is exactly the
    // kind of accidental content leak the content-blind rule exists to
    // prevent (e.g. a button whose visible text happens to be user content).
    autocapture: false,
    capture_pageleave: false,
  });
}

export function capturePageview(url: string): void {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture('$pageview', { $current_url: url });
}

export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, props);
}
