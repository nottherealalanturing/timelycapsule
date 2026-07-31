import * as Sentry from '@sentry/nextjs';
import { initAnalytics, capturePageview } from './lib/analytics';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: 'client',
  });
}

initAnalytics();

export function onRouterTransitionStart(url: string): void {
  capturePageview(url);
}
