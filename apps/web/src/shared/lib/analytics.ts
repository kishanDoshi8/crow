import { supabase } from "@/shared/lib/supabase";

// First-party product events (public.app_events, read in the analytics
// schema: see docs/analytics.md). Only things the database can't already
// tell us: landing page visits and taps, the launch video's sound, and a new
// account, so a visit can be followed to a sign-up. No third-party trackers,
// no cookies: a random visitor id lives in local storage.
export type AppEvent =
	| "landing_view"
	| "landing_start_room"
	| "landing_join"
	| "landing_video_sound"
	| "account_created";

// log_app_event isn't in the generated types until they're regenerated.
const rpc = (supabase as unknown as {
	rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>;
}).rpc.bind(supabase);

const VISITOR_KEY = "crow-visitor-id";
const SOURCE_KEY = "crow-visitor-source";

function visitorId(): string | null {
	try {
		let id = localStorage.getItem(VISITOR_KEY);
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem(VISITOR_KEY, id);
		}
		return id;
	} catch {
		return null;
	}
}

// Where a visitor came from (?ref= or ?utm_source=), remembered from the
// first landing page visit so later events carry it too.
function source(): string | null {
	try {
		const params = new URLSearchParams(globalThis.location.search);
		const fromUrl = params.get("ref") ?? params.get("utm_source");
		if (fromUrl) {
			localStorage.setItem(SOURCE_KEY, fromUrl.slice(0, 64));
			return fromUrl;
		}
		return localStorage.getItem(SOURCE_KEY);
	} catch {
		return null;
	}
}

// Fire and forget: never awaited, never throws, never blocks the page.
// Skipped when the browser asks not to be tracked.
export function track(name: AppEvent) {
	if (globalThis.navigator?.doNotTrack === "1") return;
	const id = visitorId();
	if (!id) return;
	void (async () => {
		try {
			await rpc("log_app_event", {
				p_name: name,
				p_visitor_id: id,
				p_source: source(),
				p_path: globalThis.location.pathname,
			});
		} catch {
			// Analytics must never break the app.
		}
	})();
}
