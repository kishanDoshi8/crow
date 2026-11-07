import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/shared/lib/supabase";
import { roomKeys } from "@/shared/constants/queryKeys";
import { invalidateRoomResults } from "@/shared/lib/roomCache";

// Changes arrive in bursts: revealing one result updates the prediction,
// every bettor's wallet and room stats, and the feed, all at once. Each kind
// of refresh is noted and run once per burst, a moment after the first event.
const BURST_MS = 250;

// Keeps a room's data live while it's open. Results refresh wallets,
// standings and history; member changes refresh the member list; the feed
// refreshes itself. After the socket reconnects (phones pause it in the
// background) everything catches up, since events sent meanwhile are lost.
export function useRoomRealtime(roomId: string | null) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!roomId) return;

		const dirty = {
			results: false,
			activities: false,
			members: false,
			predictions: new Set<string>(),
		};
		let timer: ReturnType<typeof setTimeout> | null = null;

		const flush = () => {
			timer = null;
			if (dirty.results) invalidateRoomResults(queryClient, roomId);
			if (dirty.members) {
				// Members and roles come with the by-code room query.
				queryClient.invalidateQueries({
					predicate: (query) =>
						query.queryKey[0] === roomKeys.all[0] &&
						query.queryKey[1] === "code" &&
						(query.state.data as { id?: string } | undefined)?.id === roomId,
				});
			}
			if (dirty.activities) {
				queryClient.invalidateQueries({
					predicate: (query) =>
						query.queryKey[0] === roomKeys.all[0] &&
						query.queryKey[1] === roomId &&
						query.queryKey[2] === "activities",
				});
			}
			for (const predictionId of dirty.predictions) {
				queryClient.invalidateQueries({
					queryKey: roomKeys.prediction(roomId, predictionId),
				});
			}
			dirty.results = false;
			dirty.activities = false;
			dirty.members = false;
			dirty.predictions.clear();
		};

		const mark = (change: (d: typeof dirty) => void) => {
			change(dirty);
			timer ??= setTimeout(flush, BURST_MS);
		};

		let hasSubscribed = false;
		const channel = supabase
			.channel(`room:${roomId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "room_members",
					filter: `room_id=eq.${roomId}`,
				},
				// Joins, leaves and roles, and the winnings and streaks that
				// standings show.
				() => mark((d) => {
					d.members = true;
					d.results = true;
				}),
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "predictions",
					filter: `room_id=eq.${roomId}`,
				},
				(payload) => mark((d) => {
					d.results = true;
					const predictionId =
						(payload.new as { id?: string } | null)?.id ??
						(payload.old as { id?: string } | null)?.id;
					if (predictionId) d.predictions.add(predictionId);
				}),
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "room_activities",
					filter: `room_id=eq.${roomId}`,
				},
				() => mark((d) => {
					d.activities = true;
				}),
			)
			.subscribe((status) => {
				if (status !== "SUBSCRIBED") return;
				// The first subscribe needs no catch-up; a reconnect does.
				if (hasSubscribed) {
					mark((d) => {
						d.results = true;
						d.activities = true;
						d.members = true;
					});
				}
				hasSubscribed = true;
			});

		return () => {
			if (timer) clearTimeout(timer);
			supabase.removeChannel(channel);
		};
	}, [roomId, queryClient]);
}

export function useRoomBetRealtime(
	roomId: string,
	predictionId: string | null,
) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!predictionId) return;

		const channel = supabase
			.channel(`prediction:${predictionId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "bets",
					filter: `prediction_id=eq.${predictionId}`,
				},
				() => {
					queryClient.invalidateQueries({
						queryKey: roomKeys.prediction(roomId, predictionId),
					});
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [roomId, predictionId, queryClient]);
}
