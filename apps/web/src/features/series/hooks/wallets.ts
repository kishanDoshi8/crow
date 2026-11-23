import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMySeriesWallets } from "@/shared/lib/api";
import { localStorageKeys, roomKeys } from "@/shared/constants/queryKeys";
import { useSeriesSelector } from "@/features/series/hooks/series";

// ============================================================
// Series wallets
// Points live per series, so balances are read per room and
// picked by series.
// ============================================================

export const useMySeriesWallets = (roomId?: string) => {
	return useQuery({
		queryKey: roomKeys.seriesWallets(roomId ?? ""),
		queryFn: () => getMySeriesWallets(roomId ?? ""),
		enabled: !!roomId,
	});
};

export const useSeriesWallet = (roomId?: string, seriesId?: string | null) => {
	const query = useMySeriesWallets(roomId);
	const wallet =
		query.data?.find((item) => item.series_id === seriesId) ?? null;

	return { ...query, wallet };
};

// ============================================================
// useCurrentSeries
// The series a player is looking at in a room. Shared by the
// header, dashboard, leaderboard, history and activities, and
// remembered per room on this device.
// ============================================================

const currentSeriesListeners = new Set<() => void>();

const currentSeriesStorageKey = (roomId: string) =>
	`${localStorageKeys.userPreference.currentSeries}.${roomId}`;

function readCurrentSeries(roomId?: string): string | null {
	if (!roomId) return null;
	try {
		return localStorage.getItem(currentSeriesStorageKey(roomId));
	} catch {
		return null;
	}
}

function writeCurrentSeries(roomId: string, seriesId: string | null) {
	try {
		if (seriesId) {
			localStorage.setItem(currentSeriesStorageKey(roomId), seriesId);
		} else {
			localStorage.removeItem(currentSeriesStorageKey(roomId));
		}
	} catch {
		// Storage can be unavailable (private mode); the choice then lasts for this session only.
	}
	currentSeriesListeners.forEach((listener) => listener());
}

function subscribeCurrentSeries(listener: () => void) {
	currentSeriesListeners.add(listener);
	return () => currentSeriesListeners.delete(listener);
}

export function useCurrentSeries(roomId?: string) {
	const storedSeriesId = useSyncExternalStore(subscribeCurrentSeries, () =>
		readCurrentSeries(roomId),
	);
	// Every non-archived series, active ones first.
	const { data, isPending } = useSeriesSelector(roomId, "all");
	const seriesOptions = data?.series ?? [];

	const currentSeries =
		seriesOptions.find((series) => series.id === storedSeriesId) ??
		seriesOptions.find((series) => series.status === "active") ??
		// Nothing running: the series that finished last, with its final
		// standings, rather than one that hasn't started yet or an old one.
		latestCompleted(seriesOptions) ??
		seriesOptions[0] ??
		null;

	const setCurrentSeriesId = useCallback(
		(seriesId: string | null) => {
			if (roomId) writeCurrentSeries(roomId, seriesId);
		},
		[roomId],
	);

	return {
		currentSeries,
		currentSeriesId: currentSeries?.id ?? null,
		setCurrentSeriesId,
		seriesOptions,
		hasActiveSeries: seriesOptions.some((series) => series.status === "active"),
		isPending,
	};
}

// The series that finished most recently, if any has. Sorted by when it
// finished, not when it started: series can overlap.
function latestCompleted<T extends { status: string; completed_at?: string | null }>(
	seriesOptions: T[],
): T | undefined {
	let latest: T | undefined;
	for (const series of seriesOptions) {
		if (series.status !== "completed" || !series.completed_at) continue;
		if (!latest?.completed_at || series.completed_at > latest.completed_at) latest = series;
	}
	return latest;
}
