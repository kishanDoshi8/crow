// Error reporting through Sentry, switched on by VITE_SENTRY_DSN. The SDK is
// loaded after start-up so it never weighs on the first paint; anything
// reported before it arrives is queued. Without a DSN (local dev, forks)
// errors only go to the console.
//
// Privacy: no cookies, headers, request bodies or query strings, and the
// user is identified by their opaque auth id only, never email or name.

import type * as SentrySdk from "@sentry/react";

type Sentry = typeof SentrySdk;

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const MAX_QUEUED = 20;

let sentry: Sentry | null = null;
const queued: Array<(sdk: Sentry) => void> = [];

export function initErrorReporting() {
	if (!dsn) return;
	import("@sentry/react")
		.then((sdk) => {
			sdk.init({
				dsn,
				release: __APP_VERSION__,
				environment: import.meta.env.MODE,
				// Nothing about the person or their requests beyond the error itself.
				dataCollection: {
					userInfo: false,
					cookies: false,
					httpHeaders: false,
					httpBodies: [],
					urlQueryParams: false,
				},
				// Errors only for now: no performance tracing or session replay.
				tracesSampleRate: 0,
				ignoreErrors: [
					// Browser noise with no user impact.
					"ResizeObserver loop limit exceeded",
					"ResizeObserver loop completed with undelivered notifications",
				],
			});
			sentry = sdk;
			for (const run of queued.splice(0)) run(sdk);
		})
		.catch(() => {
			// Blocked by an ad blocker or offline: carry on without it.
		});
}

function withSentry(run: (sdk: Sentry) => void) {
	if (sentry) {
		run(sentry);
	} else if (dsn && queued.length < MAX_QUEUED) {
		queued.push(run);
	}
}

// Errors the app raises on purpose and shows to the player, like "Betting
// deadline has passed" (Postgres codes P0001-P0099), requests the browser
// cancelled, and actions tried while offline. They aren't bugs, so they
// aren't reported.
function isExpected(error: unknown) {
	if (typeof error !== "object" || error === null) return false;
	const { code, name } = error as { code?: unknown; name?: unknown };
	if (typeof code === "string" && /^P0\d{3}$/.test(code)) return true;
	return name === "AbortError" || name === "OfflineError";
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
	if (isExpected(error)) return;
	if (!dsn) {
		if (import.meta.env.DEV) console.error(error, context);
		return;
	}
	withSentry((sdk) =>
		sdk.captureException(error, context ? { extra: context } : undefined),
	);
}

// Tags reports with who hit them, so one person's repeated crash reads as one.
export function setErrorReportingUser(userId: string | null) {
	withSentry((sdk) => sdk.setUser(userId ? { id: userId } : null));
}
