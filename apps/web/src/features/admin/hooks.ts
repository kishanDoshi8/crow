import {
	adminConfirmFixture,
	adminGetCompetitions,
	adminGetFixtures,
	adminGetResults,
	adminRequestFixtureSync,
	adminSetCompetitionActive,
	adminSetFixtureResult,
	adminUpdateFixtureQuestion,
	getMyPlatformAdmin,
	type FixtureStatus,
	type ManualFixtureResult,
} from "@/shared/lib/api";
import { adminKeys, roomKeys } from "@/shared/constants/queryKeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Whether to show the way into /admin. The server checks every admin call
// itself; this only hides the link.
export const useIsPlatformAdmin = (enabled = true) =>
	useQuery({
		queryKey: adminKeys.isAdmin(),
		queryFn: getMyPlatformAdmin,
		enabled,
		staleTime: 10 * 60_000,
	});

export const useAdminResults = (enabled = true) =>
	useQuery({ queryKey: adminKeys.results(), queryFn: adminGetResults, enabled });

export const useAdminCompetitions = () =>
	useQuery({ queryKey: adminKeys.competitions(), queryFn: adminGetCompetitions });

export const useAdminFixtures = (competitionId: string) =>
	useQuery({
		queryKey: adminKeys.fixtures(competitionId),
		queryFn: () => adminGetFixtures(competitionId),
		enabled: !!competitionId,
	});

export const useSetFixtureResult = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			fixtureId,
			status,
			result,
		}: {
			fixtureId: string;
			status: Exclude<FixtureStatus, "scheduled" | "live">;
			result: ManualFixtureResult | null;
		}) => adminSetFixtureResult(fixtureId, status, result),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.results() }),
	});
};

export const useConfirmFixture = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ fixtureId, outcomes }: { fixtureId: string; outcomes: Record<string, string> }) =>
			adminConfirmFixture(fixtureId, outcomes),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: adminKeys.results() });
			// Rooms this admin plays in may have just had results revealed.
			queryClient.invalidateQueries({ queryKey: roomKeys.all });
		},
	});
};

export const useSetCompetitionActive = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ competitionId, active }: { competitionId: string; active: boolean }) =>
			adminSetCompetitionActive(competitionId, active),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: adminKeys.competitions() });
			queryClient.invalidateQueries({ queryKey: adminKeys.fixtures() });
		},
	});
};

// Every active competition, or one provider's.
export const useRequestFixtureSync = () =>
	useMutation({ mutationFn: (provider?: string) => adminRequestFixtureSync(provider) });

export const useUpdateFixtureQuestion = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			questionId,
			...changes
		}: {
			questionId: string;
			hidden?: boolean;
			title?: string;
			description?: string;
			reset?: boolean;
		}) => adminUpdateFixtureQuestion(questionId, changes),
		onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.fixtures() }),
	});
};
