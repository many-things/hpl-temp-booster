import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

import { SENTRY_DSN } from './env';

export function setupSentry() {
  if (SENTRY_DSN) {
    console.log('Sentry is enabled');

    Sentry.init({
      dsn: SENTRY_DSN,
      integrations: [
        nodeProfilingIntegration(),
        ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
      ],
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of transactions
      // Error Monitoring
      attachStacktrace: true,
      // Set sampling rate for profiling - this is relative to tracesSampleRate
      profilesSampleRate: 1.0,
    });
  }
}

export function handleError(e: unknown) {
  if (SENTRY_DSN) {
    const captureId = Sentry.captureException(e);
    console.log('Error captured with ID:', captureId);
  }
}

export function closeSentry() {
  return SENTRY_DSN ? Sentry.close() : Promise.resolve(true);
}
