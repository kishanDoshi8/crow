import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { QueryClient } from "@tanstack/react-query";
import {
	persistQueryClientRestore,
	persistQueryClientSubscribe,
	removeOldestQuery,
} from "@tanstack/react-query-persist-client";

// The query cache is saved to this device, so opening the app shows the last
// rooms, standings and predictions straight away while fresh data loads.
// It's dropped after a day, on every new deploy (data shapes can change), and
// whenever a different person signs in.

export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const CACHE_KEY = "crow.queryCache";
const OWNER_KEY = "crow.queryCacheOwner";

function storage(): Storage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		// Private mode or blocked storage: run without a saved cache.
		return undefined;
	}
}

const persister = createSyncStoragePersister({
	storage: storage(),
	key: CACHE_KEY,
	throttleTime: 1000,
	// Storage full: drop the oldest queries until it fits.
	retry: removeOldestQuery,
});

const options = {
	persister,
	maxAge: CACHE_MAX_AGE,
	buster: __APP_VERSION__,
	dehydrateOptions: {
		// Only finished, successful reads; never errors or half-loaded pages.
		shouldDehydrateQuery: (query: { state: { status: string } }) =>
			query.state.status === "success",
	},
};

function readOwner() {
	try {
		return storage()?.getItem(OWNER_KEY) ?? null;
	} catch {
		return null;
	}
}

function writeOwner(userId: string | null) {
	try {
		if (userId) storage()?.setItem(OWNER_KEY, userId);
		else storage()?.removeItem(OWNER_KEY);
	} catch {
		// Nothing to remember it in; the cache is simply not reused.
	}
}

let unsubscribe: (() => void) | null = null;

// Call once the signed-in user is known and before any page renders. Brings
// back this person's saved cache, or throws away anyone else's, then keeps
// saving as data changes.
export async function startQueryPersistence(
	queryClient: QueryClient,
	userId: string | null,
) {
	if (readOwner() === userId && userId) {
		try {
			await persistQueryClientRestore({ queryClient, ...options });
		} catch {
			// A broken save just means a normal, uncached start.
		}
	} else {
		queryClient.clear();
		await persister.removeClient();
		writeOwner(userId);
	}

	unsubscribe ??= persistQueryClientSubscribe({ queryClient, ...options });
}

// A different person signed in without a reload: start them from empty.
export function claimQueryCache(queryClient: QueryClient, userId: string | null) {
	if (readOwner() === userId) return;
	queryClient.clear();
	void persister.removeClient();
	writeOwner(userId);
}
