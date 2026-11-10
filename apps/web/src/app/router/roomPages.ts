// Pages reached from inside a room that load on demand. The router uses
// these loaders for its lazy routes, and the room layout calls
// prefetchRoomPages once the room has settled, so opening one of them later
// never waits on a download.
export const roomPageLoaders = {
	upNext: () => import("@/features/series/pages/UpNextPage"),
	seriesCreate: () => import("@/features/series/pages/SeriesCreatePage"),
	predictionNew: () => import("@/features/predictions/pages/New"),
	predictionNewSet: () => import("@/features/predictions/pages/NewSet"),
	resolveSeveral: () => import("@/features/predictions/pages/ResolveSeveral"),
	editPrediction: () => import("@/features/predictions/pages/EditPrediction"),
	manage: () => import("@/features/rooms/pages/ManagePage"),
	members: () => import("@/features/rooms/pages/MembersPage"),
	settings: () => import("@/features/rooms/pages/RoomSettingsPage"),
};

let prefetched = false;

export function prefetchRoomPages() {
	if (prefetched) return;
	// Respect data saver: those pages can still load when opened.
	const connection = (navigator as { connection?: { saveData?: boolean } })
		.connection;
	if (connection?.saveData) return;
	prefetched = true;

	const run = () => {
		for (const load of Object.values(roomPageLoaders)) {
			load().catch(() => {
				// Offline or a new deploy: they'll load when opened instead.
				prefetched = false;
			});
		}
	};
	if ("requestIdleCallback" in globalThis) {
		globalThis.requestIdleCallback(run, { timeout: 4000 });
	} else {
		setTimeout(run, 2000);
	}
}
