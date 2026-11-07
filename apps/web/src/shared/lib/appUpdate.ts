import { useEffect } from "react";
import { toast } from "sonner";

// Right after opening, a new build is loaded silently; later on, the player
// is asked, so nothing reloads under their fingers.
const SILENT_RELOAD_WINDOW_MS = 10_000;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RELOAD_GUARD_KEY = "appUpdate.reloadedFor";
const UPDATE_TOAST_ID = "app-update";

let hasInteracted = false;

async function fetchDeployedVersion(): Promise<string | null> {
	try {
		const response = await fetch("/version.json", { cache: "no-store" });
		if (!response.ok) return null;
		const data = (await response.json()) as { version?: unknown };
		return typeof data.version === "string" ? data.version : null;
	} catch {
		// Offline or mid-deploy: try again on the next check.
		return null;
	}
}

// Reloads once per target; returns false if this session already tried, so a
// stale cache can never cause a reload loop.
function reloadOnceFor(target: string) {
	try {
		if (sessionStorage.getItem(RELOAD_GUARD_KEY) === target) return false;
		sessionStorage.setItem(RELOAD_GUARD_KEY, target);
	} catch {
		// Storage unavailable: reload anyway; the new page won't need another.
	}
	window.location.reload();
	return true;
}

function promptToRefresh() {
	toast("A new version of Crow is ready", {
		id: UPDATE_TOAST_ID,
		duration: Infinity,
		position: "top-center",
		action: {
			label: "Refresh",
			onClick: () => window.location.reload(),
		},
	});
}

async function checkForUpdate() {
	const deployed = await fetchDeployedVersion();
	if (!deployed || deployed === __APP_VERSION__) return;

	const justOpened = performance.now() < SILENT_RELOAD_WINDOW_MS && !hasInteracted;
	if (justOpened && reloadOnceFor(deployed)) return;
	promptToRefresh();
}

export function useAppUpdate() {
	useEffect(() => {
		if (__APP_VERSION__ === "dev") return;

		const markInteracted = () => {
			hasInteracted = true;
		};
		const handleVisible = () => {
			if (document.visibilityState === "visible") void checkForUpdate();
		};
		// A deploy removes the previous build's chunks; load the new build
		// instead of showing an error.
		const handlePreloadError = (event: Event) => {
			event.preventDefault();
			if (!reloadOnceFor(`chunk:${__APP_VERSION__}`)) promptToRefresh();
		};

		void checkForUpdate();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") void checkForUpdate();
		}, CHECK_INTERVAL_MS);
		window.addEventListener("pointerdown", markInteracted, { once: true });
		window.addEventListener("keydown", markInteracted, { once: true });
		document.addEventListener("visibilitychange", handleVisible);
		window.addEventListener("vite:preloadError", handlePreloadError);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener("pointerdown", markInteracted);
			window.removeEventListener("keydown", markInteracted);
			document.removeEventListener("visibilitychange", handleVisible);
			window.removeEventListener("vite:preloadError", handlePreloadError);
		};
	}, []);
}
