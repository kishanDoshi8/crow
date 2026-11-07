import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getPredictionTalk, postPredictionPhrase, setPredictionReaction } from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import type { ReactionKey } from "./reactions";
import type { PredictionTalk } from "./types";

export const usePredictionTalk = (roomId: string, predictionId: string) =>
	useQuery({
		queryKey: roomKeys.talk(roomId, predictionId),
		queryFn: () => getPredictionTalk(predictionId),
		enabled: !!roomId && !!predictionId,
	});

const refreshHistory = (queryClient: ReturnType<typeof useQueryClient>, roomId: string) =>
	queryClient.invalidateQueries({ queryKey: ["prediction-history", roomId] });

// Reacting feels instant: counts change on tap and roll back if it fails.
export const useSetReaction = (roomId: string, predictionId: string) => {
	const queryClient = useQueryClient();
	const key = roomKeys.talk(roomId, predictionId);

	return useMutation({
		mutationFn: (reaction: ReactionKey | null) => setPredictionReaction(predictionId, reaction),
		onMutate: async (reaction) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<PredictionTalk>(key);
			if (previous) {
				queryClient.setQueryData<PredictionTalk>(key, withReaction(previous, reaction));
			}
			return { previous };
		},
		onError: (error, _reaction, context) => {
			if (context?.previous) queryClient.setQueryData(key, context.previous);
			toast.error("Couldn't save your reaction.", {
				description: error.message,
				position: "top-center",
			});
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
			refreshHistory(queryClient, roomId);
		},
	});
};

export const usePostPhrase = (roomId: string, predictionId: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (phraseId: number) => postPredictionPhrase(predictionId, phraseId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: roomKeys.talk(roomId, predictionId) });
			refreshHistory(queryClient, roomId);
		},
	});
};

// The talk as it will be once the caller's reaction changes.
function withReaction(talk: PredictionTalk, next: ReactionKey | null): PredictionTalk {
	const counts = new Map(talk.reactions.map((r) => [r.reaction, r.count]));
	if (talk.my_reaction) counts.set(talk.my_reaction, (counts.get(talk.my_reaction) ?? 1) - 1);
	if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
	return {
		...talk,
		my_reaction: next,
		reactions: [...counts.entries()]
			.filter(([, count]) => count > 0)
			.map(([reaction, count]) => ({ reaction, count })),
	};
}
