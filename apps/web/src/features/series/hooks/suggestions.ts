import {
	clearUpNextPick,
	getUpNext,
	markSeriesSuggestionPlayed,
	pickUpNext,
	removeSeriesSuggestion,
	startSeriesFromIdea,
	type UpNextBoard,
} from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The room's "Up next" board: what to predict next, one pick each.
export const useUpNext = (roomId?: string, enabled = true) =>
	useQuery({
		queryKey: roomKeys.seriesSuggestions(roomId ?? ""),
		queryFn: () => getUpNext(roomId ?? ""),
		enabled: !!roomId && enabled,
	});

type Pick = { competitionId: string } | { title: string } | null;

// Your pick, shown straight away: the board moves your pick to the option
// (or clears it), then takes the server's board when it answers.
export const usePickUpNext = (roomId?: string) => {
	const queryClient = useQueryClient();
	const queryKey = roomKeys.seriesSuggestions(roomId ?? "");

	return useMutation({
		mutationFn: (pick: Pick) =>
			pick ? pickUpNext(roomId ?? "", pick) : clearUpNextPick(roomId ?? ""),
		onMutate: async (pick) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<UpNextBoard>(queryKey);
			if (previous && (!pick || "competitionId" in pick)) {
				const target = pick && "competitionId" in pick ? pick.competitionId : null;
				const hadPick = previous.options.some((o) => o.picked_by_me);
				queryClient.setQueryData<UpNextBoard>(queryKey, {
					...previous,
					total_picks: previous.total_picks + (target ? (hadPick ? 0 : 1) : hadPick ? -1 : 0),
					options: previous.options.map((option) => {
						const isTarget = !!target && option.competition_id === target;
						if (isTarget && !option.picked_by_me) {
							return { ...option, picked_by_me: true, picks: option.picks + 1 };
						}
						if (!isTarget && option.picked_by_me) {
							return { ...option, picked_by_me: false, picks: option.picks - 1 };
						}
						return option;
					}),
				});
			}
			return { previous };
		},
		onError: (_error, _pick, context) => {
			if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
		},
		onSuccess: (board) => queryClient.setQueryData(queryKey, board),
	});
};

// Hosts take an idea off the board.
export const useRemoveSuggestion = (roomId?: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (suggestionId: string) => removeSeriesSuggestion(suggestionId),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: roomKeys.seriesSuggestions(roomId ?? "") }),
	});
};

// The series form, opened from an idea, takes it off the board once created.
export const useMarkSuggestionPlayed = (roomId?: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ suggestionId, seriesId }: { suggestionId: string; seriesId: string }) =>
			markSeriesSuggestionPlayed(suggestionId, seriesId),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: roomKeys.seriesSuggestions(roomId ?? "") }),
	});
};

// Hosts start the next series from an idea in one go. Everything about the
// room's series and fixtures changes, so it all refreshes.
export const useStartSeriesFromIdea = (roomId?: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ suggestionId, title, follow }: { suggestionId: string; title: string; follow: boolean }) =>
			startSeriesFromIdea(suggestionId, title, follow),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId ?? "") }),
	});
};
