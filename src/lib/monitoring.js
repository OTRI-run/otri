// Browser error reporting. Off unless the site was built with VITE_SENTRY_DSN set (a repository
// variable in GitHub Actions, see .github/workflows/pages.yml); then uncaught errors and crashes
// caught by the ErrorBoundary are sent to Sentry with the commit as the release. The SDK is
// loaded on demand so visitors of an unmonitored build never download it. No personal data is
// attached, no performance tracing, no session replay.
let sentry = null

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        release: typeof __OTRI_COMMIT_FULL__ === 'string' && __OTRI_COMMIT_FULL__ ? `otri-site@${__OTRI_COMMIT_FULL__}` : undefined,
        environment: window.location.hostname === 'otri.run' ? 'production' : 'development',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        // The API's own 4xx answers are expected behaviour, not crashes.
        ignoreErrors: [/^Request failed with status 4\d\d/, 'ResizeObserver loop'],
      })
      sentry = Sentry
    })
    .catch(() => {
      // Blocked by a content filter or offline: the site works the same without it.
    })
}

export function reportError(error, context) {
  if (!sentry) return
  try {
    sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    // never let reporting break the page
  }
}
