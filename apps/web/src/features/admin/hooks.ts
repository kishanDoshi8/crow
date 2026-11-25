import {
	adminAddCompetition,
	adminAddFixtureExtra,
	adminDeleteFixtureExtra,
	adminSearchSeries,
	type ProviderSeries,
	adminConfirmFixture,
	adminGetCompetitions,
	adminGetFixtures,
	adminGetResults,
	adminRequestFixtureSync,
	adminSetCompetitionActive,
	adminSetCompetitionTag,
	adminGetUpNextDemand,
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

// The tag a competition's questions get; rooms' questions from it follow.
export const useSetCompetitionTag = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ competitionId, tag }: { competitionId: string; tag: string | null }) =>
			adminSetCompetitionTag(competitionId, tag),
		onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.competitions() }),
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

// CricketData.org's series matching a name (one API call each time).
export const useSearchSeries = () => useMutation({ mutationFn: (query: string) => adminSearchSeries(query) });

// Adds a series, then syncs its provider so its matches arrive now.
export const useAddCompetition = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ series, tag }: { series: ProviderSeries; tag?: string | null }) => {
			const added = await adminAddCompetition(series, "cricket", tag);
			await adminRequestFixtureSync(series.provider);
			return added;
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: adminKeys.competitions() });
			// The sync runs on its own: look again once it has had time.
			setTimeout(() => queryClient.invalidateQueries({ queryKey: adminKeys.competitions() }), 20_000);
		},
	});
};

export const useAddFixtureExtra = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			fixtureId,
			title,
			description,
			options,
		}: {
			fixtureId: string;
			title: string;
			description: string;
			options: string[];
		}) => adminAddFixtureExtra(fixtureId, title, description, options),
		onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.fixtures() }),
	});
};

export const useDeleteFixtureExtra = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (questionId: string) => adminDeleteFixtureExtra(questionId),
		onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.fixtures() }),
	});
};

// What rooms ask to predict next, across rooms (Up next).
export const useUpNextDemand = () =>
	useQuery({ queryKey: adminKeys.upNextDemand(), queryFn: adminGetUpNextDemand });
