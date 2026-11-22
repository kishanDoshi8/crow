import {
	addFixtureQuestions,
	getRoomCompetitionFixtures,
	getRoomCompetitions,
	setRoomCompetition,
	type RoomCompetition,
} from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Organizers: every competition on offer, with what the room follows.
export const useRoomCompetitions = (roomId: string, enabled = true) =>
	useQuery({
		queryKey: roomKeys.competitions(roomId),
		queryFn: () => getRoomCompetitions(roomId),
		enabled: !!roomId && enabled,
	});

// One competition's coming matches and their questions.
export const useCompetitionFixtures = (roomId: string, competitionId: string, enabled = true) =>
	useQuery({
		queryKey: roomKeys.competitionFixtures(roomId, competitionId),
		queryFn: () => getRoomCompetitionFixtures(roomId, competitionId),
		enabled: !!roomId && !!competitionId && enabled,
	});

export const useFollowCompetition = (roomId: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ competitionId, follow }: { competitionId: string; follow: boolean }) =>
			setRoomCompetition(roomId, competitionId, follow),
		// The button flips straight away.
		onMutate: async ({ competitionId, follow }) => {
			await queryClient.cancelQueries({ queryKey: roomKeys.competitions(roomId) });
			const previous = queryClient.getQueryData<RoomCompetition[]>(roomKeys.competitions(roomId));
			if (previous) {
				queryClient.setQueryData<RoomCompetition[]>(
					roomKeys.competitions(roomId),
					previous.map((c) => (c.id === competitionId ? { ...c, following: follow } : c)),
				);
			}
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous) queryClient.setQueryData(roomKeys.competitions(roomId), context.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: roomKeys.fixtures(roomId) }),
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
