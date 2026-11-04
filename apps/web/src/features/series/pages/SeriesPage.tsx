import { useRoomContext } from "@/shared/lib/roomContext";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useRoomRole } from "@/features/rooms";
import {
	usePredictionHistory,
	useSeriesLeaderboard,
} from "@/features/leaderboard";
import { useActivePredictions } from "@/features/predictions";
import { SeriesDetailView } from "@/features/series/components/SeriesDetailView";
import { SeriesListView } from "@/features/series/components/SeriesListView";
import { SeriesOverviewCardSkeleton } from "@/features/series/components/SeriesOverviewCard";
import {
	useRoomSeries,
	useSeriesAwards,
	useSeriesPlacements,
	useUpdateSeries,
	useCompleteSeries,
	useArchiveSeries,
} from "@/features/series/hooks/series";
import { useCurrentSeries } from "@/features/series/hooks/wallets";
import type { Series } from "@/features/series/types/series";
import type { SeriesFormState } from "@/features/series/components/SeriesEditDialog";
import { parseExpectedGames } from "@/features/series/components/SeriesGamesField";
import {
	getMinBetsError,
	getSeriesPointsError,
} from "@/features/series/lib/points";
import { Button, Skeleton } from "@/shared/ui";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const defaultFormState: SeriesFormState = {
	title: "",
	description: "",
	openEnded: true,
	expectedGames: "0",
	startingStack: "1000",
	weeklyTopup: "100",
	minBetsToRank: "3",
};

type SeriesByStatus = {
	draft?: Series[];
	active?: Series[];
	completed?: Series[];
	archived?: Series[];
};

function getAllSeries(seriesByStatus?: SeriesByStatus) {
	return [
		...(seriesByStatus?.draft ?? []),
		...(seriesByStatus?.active ?? []),
		...(seriesByStatus?.completed ?? []),
		...(seriesByStatus?.archived ?? []),
	];
}

function saveSeriesEdit({
	editingSeriesId,
	formState,
	updateSeries,
}: {
	editingSeriesId: string | null;
	formState: SeriesFormState;
	updateSeries: (args: {
		seriesId: string;
		title: string;
		description: string;
		expectedGames: number;
		startingStack: number;
		weeklyTopup: number;
		minBetsToRank: number;
	}) => void;
}) {
	if (!editingSeriesId) {
		return;
	}

	const title = formState.title.trim();
	const expectedGames = parseExpectedGames(
		formState.openEnded,
		formState.expectedGames,
	);

	if (!title) {
		toast("Series title is required.");
		return;
	}

	if (expectedGames === null) {
		toast("Expected games must be a whole number of at least 1.");
		return;
	}

	const pointsError = getSeriesPointsError(
		formState.startingStack,
		formState.weeklyTopup,
	);
	if (pointsError) {
		toast(pointsError);
		return;
	}

	const minBetsError = getMinBetsError(formState.minBetsToRank);
	if (minBetsError) {
		toast(minBetsError);
		return;
	}

	updateSeries({
		seriesId: editingSeriesId,
		title,
		description: formState.description,
		expectedGames,
		startingStack: Number(formState.startingStack),
		weeklyTopup: Number(formState.weeklyTopup),
		minBetsToRank: Number(formState.minBetsToRank),
	});
}

export default function SeriesPage() {
	const { room } = useRoomContext();
	const { seriesId } = useParams<{ seriesId?: string }>();
	const navigate = useNavigate();
	const { back } = useAppNavigation();
	const location = useLocation();
	const { data: seriesByStatus, isPending } = useRoomSeries(room.id);
	const { data: roomPredictions = [] } = useActivePredictions(
		room.id,
		seriesId,
	);
	const { data: seriesHistoryPages, isPending: isSeriesHistoryPending } =
		usePredictionHistory(room.id, "all", "", seriesId);

	const { mutate: updateSeries, isPending: isUpdatePending } =
		useUpdateSeries(room.id);
	const { mutate: completeSeries, isPending: isCompleteSeriesPending } =
		useCompleteSeries(room.id);
	const { mutate: archiveSeries, isPending: isArchiveSeriesPending } =
		useArchiveSeries(room.id);

	const { can } = useRoomRole(room);
	const { currentSeriesId } = useCurrentSeries(room.id);
	const isOrganizer = can.organize;

	const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [formState, setFormState] =
		useState<SeriesFormState>(defaultFormState);


	const activeSeries = seriesByStatus?.active ?? [];
	const completedSeries = seriesByStatus?.completed ?? [];

	const allSeries = useMemo(
		() => getAllSeries(seriesByStatus),
		[seriesByStatus],
	);

	const selectedSeries = useMemo(
		() => allSeries.find((series) => series.id === seriesId) ?? null,
		[allSeries, seriesId],
	);
	const {
		data: seriesLeaderboard = [],
		isPending: isSeriesLeaderboardLoading,
	} = useSeriesLeaderboard(
		room.id,
		selectedSeries?.id ?? null,
		!!selectedSeries,
	);
	const isClosedSeries =
		selectedSeries?.status === "completed" ||
		selectedSeries?.status === "archived";
	const {
		data: seriesPlacements = [],
		isPending: isSeriesPlacementsLoading,
	} = useSeriesPlacements(
		room.id,
		selectedSeries?.id ?? null,
		!!isClosedSeries,
	);
	const { data: seriesAwards = [], isPending: isSeriesAwardsLoading } =
		useSeriesAwards(room.id, selectedSeries?.id ?? null, !!isClosedSeries);

	const seriesOpenPredictions = useMemo(() => {
		if (!selectedSeries) {
			return [];
		}

		return roomPredictions.filter((prediction) => {
			const predictionSeriesId =
				prediction.seriesId ?? prediction.series_id;
			return (
				predictionSeriesId === selectedSeries.id &&
				(prediction.status === "draft" ||
					prediction.status === "locked")
			);
		});
	}, [roomPredictions, selectedSeries]);

	const seriesCompletedPredictions = useMemo(
		() =>
			seriesHistoryPages?.pages
				.flatMap((page) => page.items)
				.slice(0, 20) ?? [],
		[seriesHistoryPages],
	);

	const handleArchive = (targetSeriesId: string) => {
		archiveSeries(targetSeriesId, {
			onSuccess: () => {
				toast("Series archived.");
				back(`/rooms/${room.code}/series`);
			},
			onError: (error) => {
				toast("Failed to archive series.", {
					description: error.message,
				});
			},
		});
	};

	const handleCloseSeries = (targetSeriesId: string) => {
		completeSeries(targetSeriesId, {
			onSuccess: () => {
				toast("Series closed.");
			},
			onError: (error) => {
				toast("Failed to close series.", {
					description: error.message,
				});
			},
		});
	};

	const openEditDialog = (series: Series) => {
		setEditingSeriesId(series.id);
		setFormState({
			title: series.title,
			description: series.description ?? "",
			openEnded: series.expectedGames === 0,
			expectedGames: String(series.expectedGames),
			startingStack: String(series.startingStack),
			weeklyTopup: String(series.weeklyTopup),
			minBetsToRank: String(series.minBetsToRank),
		});
		setIsEditorOpen(true);
	};

	const resetEditor = () => {
		setEditingSeriesId(null);
		setFormState(defaultFormState);
		setIsEditorOpen(false);
	};

	const handleUpdateSeries = (payload: {
		seriesId: string;
		title: string;
		description: string;
		expectedGames: number;
		startingStack: number;
		weeklyTopup: number;
	}) => {
		updateSeries(payload, {
			onSuccess: () => {
				toast("Series updated.");
				resetEditor();
			},
			onError: (error) => {
				toast("Failed to update series.", {
					description: error.message,
				});
			},
		});
	};

	const handleSaveEdit = () => {
		saveSeriesEdit({
			editingSeriesId,
			formState,
			updateSeries: handleUpdateSeries,
		});
	};

	if (!seriesId) {
		return (
			<SeriesListView
				isPending={isPending}
				activeSeries={activeSeries}
				completedSeries={completedSeries}
				roomId={room.id}
				roomCode={room.code}
				currentSeriesId={currentSeriesId}
				isOrganizer={isOrganizer}
				onCreateNew={() => navigate(`/rooms/${room.code}/series/new`)}
			/>
		);
	}

	if (isPending) {
		return (
			// Mirrors SeriesDetailView's top: overview, then the open predictions.
			<div
				aria-hidden='true'
				className='mx-auto w-full max-w-md space-y-6 p-4'
			>
				<SeriesOverviewCardSkeleton />
				<div className='space-y-3'>
					<Skeleton className='my-1 h-5 w-40' />
					<Skeleton className='h-80 w-full rounded-xl' />
				</div>
			</div>
		);
	}

	if (!selectedSeries) {
		return (
			<div className='mx-auto w-full max-w-md space-y-4 p-4'>
				<p className='text-sm text-muted-foreground'>
					Series not found.
				</p>
				<Button
					variant='outline'
					onClick={() => back(`/rooms/${room.code}/series`)}
				>
					Back to series
				</Button>
			</div>
		);
	}

	return (
		<SeriesDetailView
			series={selectedSeries}
			isOrganizer={isOrganizer}
			canArchive={can.own}
			isActionPending={
				isUpdatePending || isCompleteSeriesPending || isArchiveSeriesPending
			}
			isUpdatePending={isUpdatePending}
			seriesOpenPredictions={seriesOpenPredictions}
			seriesCompletedPredictions={seriesCompletedPredictions}
			isCompletedPredictionsLoading={isSeriesHistoryPending}
			seriesLeaderboard={seriesLeaderboard}
			isSeriesLeaderboardLoading={isSeriesLeaderboardLoading}
			seriesPlacements={seriesPlacements}
			isSeriesPlacementsLoading={isSeriesPlacementsLoading}
			seriesAwards={seriesAwards}
			isSeriesAwardsLoading={isSeriesAwardsLoading}
			isEditorOpen={isEditorOpen}
			formState={formState}
			onEdit={() => openEditDialog(selectedSeries)}
			onArchive={() => handleArchive(selectedSeries.id)}
			onCloseSeries={() => handleCloseSeries(selectedSeries.id)}
			onNewPrediction={() =>
				navigate(`/rooms/${room.code}/predictions/new`, {
					state: {
						from: location.pathname,
						seriesId: selectedSeries.id,
					},
				})
			}
			onEditDialogOpenChange={setIsEditorOpen}
			onFormStateChange={setFormState}
			onCancelEdit={resetEditor}
			onSaveEdit={handleSaveEdit}
		/>
	);
}
