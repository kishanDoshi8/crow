// Shared links carry ?ref=<kind> (e.g. "brag-card"). The first one a person
// arrives with is kept until they join a room, so we can see which shareables
// bring people in. Kept in localStorage to survive sign-in and Google.
const KEY = "referral";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const VALID_REF = /^[a-z][a-z-]{0,31}$/;

export type ShareKind =
	| "brag-card"
	| "champion-card"
	| "invite-link"
	| "invite-card"
	| "weekly-card"
	| "picks-nudge";

type Stored = { ref: string; at: number };

// Call once on app start; only the first ref is kept.
export function captureReferral(search = globalThis.location?.search ?? "") {
	const ref = new URLSearchParams(search).get("ref")?.toLowerCase();
	if (!ref || !VALID_REF.test(ref) || peekReferral()) return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ ref, at: Date.now() } satisfies Stored));
	} catch {
		// Storage unavailable: the join just won't be attributed.
	}
}

export function peekReferral(): string | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const stored = JSON.parse(raw) as Partial<Stored>;
		if (
			typeof stored.ref !== "string" ||
			typeof stored.at !== "number" ||
			Date.now() - stored.at > MAX_AGE_MS
		) {
			localStorage.removeItem(KEY);
			return null;
		}
		return stored.ref;
	} catch {
		return null;
	}
}

export function clearReferral() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// ignore
	}
}
