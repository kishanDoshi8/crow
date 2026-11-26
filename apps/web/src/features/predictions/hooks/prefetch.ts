import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { roomKeys } from "@/shared/constants/queryKeys";
import {
	getBetsForPrediction,
	getPickCounts,
	getPrediction,
	getPredictionNeighbours,
	getPredictionTalk,
} from "@/shared/lib/api";

// Loads what a question's page shows first (the question and its arrows,
// the bets, the pick count and Room talk) into the cache, under the keys the
// page reads, so opening it next paints at once instead of from skeletons.
// Data that's still fresh isn't fetched again.
export function usePrefetchPrediction(roomId: string) {
	const queryClient = useQueryClient();
	return useCallback(
		(predictionId: string) => {
			void queryClient
				.fetchQuery({
					queryKey: roomKeys.prediction(roomId, predictionId),
					queryFn: () => getPrediction(predictionId),
				})
				.then((prediction) => {
					if (!prediction) return;
					// Same key and arguments as usePredictionNeighbours.
					return queryClient.prefetchQuery({
						queryKey: [...roomKeys.prediction(roomId, predictionId), "neighbours"],
						queryFn: () =>
							getPredictionNeighbours({
								roomId,
								predictionId,
								seriesId: prediction.seriesId ?? prediction.series_id ?? null,
								number: prediction.seriesPredictionNumber ?? prediction.series_prediction_number ?? null,
								createdAt: prediction.created_at ?? null,
							}),
						staleTime: 60_000,
					});
				})
				// A prefetch that fails costs nothing: the page loads it as usual.
				.catch(() => undefined);
			void queryClient.prefetchQuery({
				queryKey: roomKeys.bets(roomId, predictionId),
				queryFn: () => getBetsForPrediction(predictionId),
			});
			void queryClient.prefetchQuery({
				queryKey: roomKeys.pickCounts(roomId, [predictionId]),
				queryFn: () => getPickCounts([predictionId]),
			});
			void queryClient.prefetchQuery({
				queryKey: roomKeys.talk(roomId, predictionId),
				queryFn: () => getPredictionTalk(predictionId),
			});
		},
		[queryClient, roomId],
	);
}
