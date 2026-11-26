import { useCallback, useEffect, useId, useRef } from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";

// How history works in the app, so Back feels native:
// - A room's Home is the bottom of history (depth 0). Back from it leaves.
// - The other tabs sit one entry above Home and replace each other.
// - Pages opened from there push an entry (depth + 1).
// - An open drawer or dialog pushes a marker entry on the same URL, so the
//   back gesture closes it before it changes the page.
// Each entry's depth and open sheets live in history state.

export type NavState = {
	depth?: number;
	// Ids of the sheets open on this entry, innermost last.
	sheets?: string[];
	[key: string]: unknown;
};

const ROOM_PATH = /^\/rooms\/([^/]+)(\/.*)?$/;
const TABS = ["leaderboard", "history", "series"];

export function navState(location: Pick<Location, "state">): NavState {
	return (location.state ?? {}) as NavState;
}

export function roomOf(pathname: string) {
	const match = ROOM_PATH.exec(pathname);
	if (!match) return null;
	const rest = (match[2] ?? "").replace(/\/$/, "");
	return {
		code: match[1],
		home: `/rooms/${match[1]}`,
		isHome: rest === "",
		isTab: TABS.includes(rest.slice(1)),
		// Joining isn't inside the room yet.
		isJoin: rest === "/join",
	};
}

export function pathOf(location: Pick<Location, "pathname" | "search" | "hash">) {
	return `${location.pathname}${location.search}${location.hash}`;
}

// ---------------------------------------------------------------------------
// Coordinator: multi-step moves (pop several entries, then replace or push)
// finish in NavigationSync once the pop lands.

type Pending = { kind: "replace" | "push"; to: string; state?: NavState };

export const navCoordinator = {
	pending: null as Pending | null,
	// A history.go() is on its way; sheet pops must not stack on top of it.
	inFlight: false,
	go(delta: number, then?: Pending) {
		this.pending = then ?? null;
		this.inFlight = true;
		closedSheets.clear();
		globalThis.history.go(delta);
	},
};

// ---------------------------------------------------------------------------
// Sheets

const closedSheets = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Pops the markers of sheets closed from the UI, once all the closes from
// this interaction are in (a dialog inside a drawer closes together). Only
// markers still on top are popped: if the interaction navigated, the page
// moved on and NavigationSync tidies up instead.
function requestSheetPop(id: string) {
	closedSheets.add(id);
	if (flushTimer) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		if (navCoordinator.inFlight) {
			closedSheets.clear();
			return;
		}
		const state = (globalThis.history.state?.usr ?? {}) as NavState;
		const sheets = state.sheets ?? [];
		let count = 0;
		while (
			count < sheets.length &&
			closedSheets.has(sheets[sheets.length - 1 - count])
		) {
			count++;
		}
		closedSheets.clear();
		if (count > 0) navCoordinator.go(-count);
	}, 0);
}

// Gives a drawer or dialog its own history entry while open: Back closes it,
// and closing it removes the entry.
export function useSheetHistory(
	open: boolean,
	setOpen: ((open: boolean) => void) | undefined,
) {
	const id = useId();
	const location = useLocation();
	const navigate = useNavigate();
	const state = navState(location);
	const inStack = state.sheets?.includes(id) ?? false;
	// idle -> pushing (marker requested) -> active (marker is in history)
	const phase = useRef<"idle" | "pushing" | "active">("idle");
	const setOpenRef = useRef(setOpen);
	setOpenRef.current = setOpen;

	useEffect(() => {
		if (open && phase.current === "idle" && !inStack) {
			phase.current = "pushing";
			navigate(pathOf(location), {
				state: {
					...state,
					depth: (state.depth ?? 0) + 1,
					sheets: [...(state.sheets ?? []), id],
				},
				preventScrollReset: true,
			});
			return;
		}
		if (phase.current === "pushing" && inStack) {
			phase.current = "active";
			return;
		}
		if (phase.current === "active" && !inStack) {
			// Back took the marker away: close.
			phase.current = "idle";
			if (open) setOpenRef.current?.(false);
			return;
		}
		if (!open && phase.current !== "idle") {
			// Closed from the UI: take the marker away.
			phase.current = "idle";
			requestSheetPop(id);
		}
	}, [open, inStack, id, location, navigate, state]);

	useEffect(() => {
		// Unmounted and straight back (StrictMode's double mount, a sheet that
		// mounts already open): keep the marker the unmount asked to pop.
		closedSheets.delete(id);
		return () => {
			if (phase.current !== "idle") requestSheetPop(id);
		};
	}, [id]);
}

// ---------------------------------------------------------------------------
// Moves

// Read at call time, not render time: a save callback can run after a sheet
// has already closed and taken its entry away.
function current() {
	const state = (globalThis.history.state?.usr ?? {}) as NavState;
	const sheets = state.sheets?.length ?? 0;
	const depth = state.depth ?? 0;
	return {
		pathname: globalThis.location.pathname,
		path: `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`,
		depth,
		sheets,
		// Depth of the page itself, under any open sheets.
		pageDepth: depth - sheets,
	};
}

export function useAppNavigation() {
	const navigate = useNavigate();

	// Pop everything back to the bottom of history, then show `to` there.
	const up = useCallback(
		(to: string) => {
			const { depth, path } = current();
			if (depth > 0) {
				navCoordinator.go(-depth, { kind: "replace", to });
			} else if (path !== to) {
				navigate(to, { replace: true, state: { depth: 0 } });
			}
		},
		[navigate],
	);

	// Back one page, closing any open sheets on the way. A page opened from a
	// link with nothing under it goes to `fallback` instead of leaving.
	const back = useCallback(
		(fallback: string) => {
			const { pageDepth, sheets } = current();
			if (pageDepth > 0) {
				navCoordinator.go(-(sheets + 1));
			} else if (sheets > 0) {
				navCoordinator.go(-sheets, { kind: "replace", to: fallback });
			} else {
				navigate(fallback, { replace: true, state: { depth: 0 } });
			}
		},
		[navigate],
	);

	// Bottom tabs: Home is the root; the other tabs replace each other one
	// entry above it.
	const switchTab = useCallback(
		(to: string) => {
			const { pathname, depth, sheets } = current();
			const here = roomOf(pathname);
			const target = roomOf(to);
			if (!here || !target) {
				navigate(to);
				return;
			}
			if (target.isHome) {
				up(to);
			} else if (here.isHome && sheets === 0) {
				navigate(to, { state: { depth: depth + 1 } });
			} else if (here.isTab && sheets === 0) {
				navigate(to, { replace: true, state: { depth } });
			} else if (depth > 0) {
				// From a deeper page: back to Home, then open the tab.
				navCoordinator.go(-depth, { kind: "push", to });
			} else {
				navigate(target.home, { replace: true, state: { depth: 0 } });
				navCoordinator.pending = { kind: "push", to };
			}
		},
		[navigate, up],
	);

	// Opens a page on top of this one. From inside an open sheet the sheet's
	// markers come off first and the page is pushed once that pop lands, so
	// the page underneath stays put instead of flashing back on the way
	// (a plain push there is tidied up by NavigationSync with a visible hop).
	// `state` rides along on the new entry, as a <Link state> would.
	const open = useCallback(
		(to: string, state?: NavState) => {
			const { depth, sheets } = current();
			if (sheets > 0) {
				navCoordinator.go(-sheets, { kind: "push", to, state });
			} else {
				navigate(to, { state: { ...state, depth: depth + 1 } });
			}
		},
		[navigate],
	);

	// Rooms are top-level: the new room's Home replaces everything.
	const switchRoom = useCallback(
		(code: string) => up(`/rooms/${code}`),
		[up],
	);

	return { back, up, open, switchTab, switchRoom };
}
