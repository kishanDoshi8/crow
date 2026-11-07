# Error reporting

The web app reports crashes and failed requests to Sentry
(`apps/web/src/shared/lib/errorReporting.ts`).

## What gets reported

- Uncaught errors and unhandled promise rejections (Sentry's own handlers).
- Pages that crash while rendering (`RouteErrorBoundary`). 404s aren't.
- Every failed query and mutation, once, from the TanStack Query caches in
  `AppProviders`.

Not reported: errors the app raises on purpose and shows to the player
(Postgres codes `P0001`–`P0099`, like "Betting deadline has passed"), and
cancelled requests.

## Privacy

No cookies, headers, request bodies or query strings are sent. Reports carry
the Supabase auth user id (an opaque UUID) so repeats from one person group
together, never the email or username. No performance tracing or session
replay. Mention Sentry as a processor in the privacy policy.

## Set up

1. Create a Sentry project (platform: React). Copy its DSN.
2. GitHub → Settings → Secrets and variables → Actions:
   - Variable `VITE_SENTRY_DSN` = the DSN. Turns reporting on.
   - Optional, for readable stack traces: variables `SENTRY_ORG` and
     `SENTRY_PROJECT` (the slugs) and secret `SENTRY_AUTH_TOKEN` (Sentry →
     Settings → Auth Tokens, scope `project:releases`). The release build
     then uploads source maps and deletes them from `dist` so they're never
     served.
3. Tag a release. Reports are grouped by the same release id as
   `/version.json`.

Without `VITE_SENTRY_DSN` the SDK isn't bundled at all and errors only go to
the console in development. Locally, put the DSN in `apps/web/.env.local` to
test.

The SDK is loaded after start-up in its own chunk, so it doesn't slow the
first paint; errors in the first moments are queued until it arrives.
