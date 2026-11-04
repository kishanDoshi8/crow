import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/shared/lib/supabase";
import { playerQueryKey, roomKeys } from "@/shared/constants/queryKeys";
import { invalidateRoomResults } from "@/shared/lib/roomCache";

export function useRoomRealtime(roomId: string | null) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!roomId) return;

		let hasSubscribed = false;
		const catchUp = () => {
			invalidateRoomResults(queryClient, roomId);
			queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === roomKeys.all[0] &&
					query.queryKey[1] === roomId &&
					query.queryKey[2] === "activities",
			});
		};

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
				() => {
					queryClient.invalidateQueries({
						queryKey: roomKeys.detail(roomId),
					});
					// The room page reads members (and their roles) from the
					// by-code query, so refresh it too.
					queryClient.invalidateQueries({
						predicate: (query) =>
							query.queryKey[0] === roomKeys.all[0] &&
							query.queryKey[1] === "code",
					});
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "predictions",
					filter: `room_id=eq.${roomId}`,
				},
				(payload) => {
					invalidateRoomResults(queryClient, roomId);
					const predictionId =
						(payload.new as { id?: string } | null)?.id ??
						(payload.old as { id?: string } | null)?.id;
					if (predictionId) {
						queryClient.invalidateQueries({
							queryKey: roomKeys.prediction(roomId, predictionId),
						});
					}
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "room_activities",
					filter: `room_id=eq.${roomId}`,
				},
				() => {
					queryClient.invalidateQueries({
						predicate: (query) =>
							query.queryKey[0] === roomKeys.all[0] &&
							query.queryKey[1] === roomId &&
							query.queryKey[2] === "activities",
					});
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "room_stats",
					filter: `room_id=eq.${roomId}`,
				},
				() => {
					queryClient.invalidateQueries({
						queryKey: roomKeys.stats(roomId),
					});
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "player_room_stats",
					filter: `room_id=eq.${roomId}`,
				},
				() => {
					queryClient.invalidateQueries({
						queryKey: roomKeys.stats(roomId),
					});
				},
			)
			.subscribe((status) => {
				console.log("Realtime status:", status);
				// Events sent while the socket was down are lost, so catch up
				// after a reconnect.
				if (status === "SUBSCRIBED") {
					if (hasSubscribed) catchUp();
					hasSubscribed = true;
				}
			});

		// Phones pause the socket in the background; refresh on return.
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") catchUp();
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
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
			.subscribe((status) => {
				console.log("Realtime bet status:", status);
			});

		return () => {
			supabase.removeChannel(channel);
		};
	}, [roomId, predictionId, queryClient]);
}

export function usePredictionDuelRealtime(
	roomId: string,
	predictionId: string | null,
) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!predictionId) return;

		const client = supabase as unknown as {
			channel: (name: string) => any;
			removeChannel: (channel: unknown) => void;
		};

		const channel = client
			.channel(`duels:${predictionId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "duels",
					filter: `prediction_id=eq.${predictionId}`,
				},
				() => {
					queryClient.invalidateQueries({
						queryKey: roomKeys.duels(roomId, predictionId),
					});
					queryClient.invalidateQueries({
						queryKey: roomKeys.duelSummary(roomId, predictionId),
					});
					queryClient.invalidateQueries({
						queryKey: playerQueryKey,
					});
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "duel_queue",
				},
				() => {
					queryClient.invalidateQueries({
						queryKey: roomKeys.duels(roomId, predictionId),
					});
					queryClient.invalidateQueries({
						queryKey: roomKeys.duelSummary(roomId, predictionId),
					});
				},
			)
			.subscribe((status: string) => {
				console.log("Realtime duel status:", status);
			});

		return () => {
			client.removeChannel(channel);
		};
	}, [predictionId, queryClient, roomId]);
}
