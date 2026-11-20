import {
	addFixtureQuestions,
	getRoomFixtures,
	setRoomCompetition,
	type RoomFixtures,
} from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Organizers: the competitions on offer and the followed ones' fixtures.
export const useRoomFixtures = (roomId: string, enabled = true) =>
	useQuery({
		queryKey: roomKeys.fixtures(roomId),
		queryFn: () => getRoomFixtures(roomId),
		enabled: !!roomId && enabled,
	});

export const useFollowCompetition = (roomId: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ competitionId, follow }: { competitionId: string; follow: boolean }) =>
			setRoomCompetition(roomId, competitionId, follow),
		// The switch moves straight away; the fixtures follow once loaded.
		onMutate: async ({ competitionId, follow }) => {
			await queryClient.cancelQueries({ queryKey: roomKeys.fixtures(roomId) });
			const previous = queryClient.getQueryData<RoomFixtures>(roomKeys.fixtures(roomId));
			if (previous) {
				queryClient.setQueryData<RoomFixtures>(roomKeys.fixtures(roomId), {
					...previous,
					competitions: previous.competitions.map((competition) =>
						competition.id === competitionId
							? { ...competition, following: follow }
							: competition,
					),
				});
			}
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(roomKeys.fixtures(roomId), context.previous);
			}
		},
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: roomKeys.fixtures(roomId) }),
	});
};

export const useAddFixtureQuestions = (roomId: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ seriesId, questionIds }: { seriesId: string; questionIds: string[] }) =>
			addFixtureQuestions(roomId, seriesId, questionIds),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: roomKeys.fixtures(roomId) });
			queryClient.invalidateQueries({ queryKey: roomKeys.activePrediction(roomId) });
			queryClient.invalidateQueries({ queryKey: roomKeys.activePredictions(roomId) });
			queryClient.invalidateQueries({ queryKey: roomKeys.manageQueue(roomId) });
			queryClient.invalidateQueries({ queryKey: roomKeys.roomTags(roomId) });
		},
	});
};
