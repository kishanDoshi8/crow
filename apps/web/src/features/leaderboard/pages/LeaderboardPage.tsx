import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";
import {
	useRoomOverallStandings,
	useSeriesLeaderboard,
} from "@/features/leaderboard/hooks/leaderboard";
import { splitStandings } from "@/features/leaderboard/lib/standings";
import { LeaderboardList } from "@/features/leaderboard/components/leaderboard/LeaderboardList";
import {
	OverallStandingsList,
} from "@/features/leaderboard/components/leaderboard/OverallStandingsList";
import {
	TopThreePodium,
	type PodiumEntry,
} from "@/features/leaderboard/components/leaderboard/TopThreePodium";
import { RankingRuleHint } from "@/features/leaderboard/components/leaderboard/RankingRuleHint";
import {
	SeriesScopeToggle,
	type SeriesScope,
	useCurrentSeries,
} from "@/features/series";
import { ShareWeeklyButton } from "@/features/leaderboard/components/ShareWeeklyButton";
import { formatSignedPoints } from "@/shared/lib/utils";
import { InfoHint } from "@/shared/ui";
import React, { Suspense, lazy } from "react";

const PlayerProfileDialog = lazy(() =>
	import("@/features/leaderboard/components/player/PlayerProfileDialog").then(
		(module) => ({ default: module.PlayerProfileDialog }),
	),
);

export function LeaderboardPage() {
	const { room } = useRoomContext();
	const { data: player } = usePlayer();
	const { currentSeries, currentSeriesId } = useCurrentSeries(room.id);
	const [scope, setScope] = React.useState<SeriesScope>("series");
	const [selectedPlayerId, setSelectedPlayerId] = React.useState<
		string | null
	>(null);
	const [isProfileDialogOpen, setIsProfileDialogOpen] = React.useState(false);

	const { data: leaderboard = [], isPending: isLeaderboardLoading } =
		useSeriesLeaderboard(room.id, currentSeriesId, scope === "series");
	const { data: overall = [], isPending: isOverallLoading } =
		useRoomOverallStandings(room.id, scope === "all");

	const podium: PodiumEntry[] =
		scope === "series"
			? splitStandings(currentSeriesId ? leaderboard : []).ranked.slice(0, 3).map((entry) => ({
					player_id: entry.player_id,
					username: entry.username,
					rank: entry.rank,
					primary: `${entry.balance.toLocaleString()} pts`,
					secondary: formatSignedPoints(entry.net_profit),
				}))
			: overall.slice(0, 3).map((entry) => ({
					player_id: entry.player_id,
					username: entry.username,
					rank: entry.rank,
					primary: `${formatSignedPoints(entry.net_profit)} pts`,
					secondary:
						entry.titles > 0
							? `${entry.titles} ${entry.titles === 1 ? "title" : "titles"}`
							: `${entry.series_played} series`,
				}));

	let subtitle = "Standings appear once a series starts.";
	if (scope === "all") {
		subtitle = "Total profit across every series, with titles won.";
	} else if (currentSeries?.status === "active") {
		const requiredBets = leaderboard[0]?.required_bets ?? 0;
		subtitle =
			requiredBets > 0
				? `Top balance among players with ${requiredBets}+ bets wins the title.`
				: "Top balance when the series closes wins the title.";
	} else if (currentSeries) {
		subtitle = "Final standings.";
	}

	const openProfile = (playerId: string) => {
		setSelectedPlayerId(playerId);
		setIsProfileDialogOpen(true);
	};

	return (
		<div className='flex flex-col gap-4 p-4 max-w-lg mx-auto w-full'>
			{/* Section heading: the share button sits beside the title, so the
			    description below gets the full width. */}
			<div>
				<div className='flex min-h-8 items-center justify-between gap-3'>
					<h2 className='min-w-0 truncate text-lg font-semibold'>
						{scope === "all"
							? "All series"
							: (currentSeries?.title ?? "Standings")}
					</h2>
					{scope === "series" && currentSeries?.status === "active" ? (
						<ShareWeeklyButton
							series={currentSeries}
							className='h-8 shrink-0 px-3 text-xs'
							label='Share week'
						/>
					) : null}
				</div>
				<p className='text-sm text-muted-foreground'>
					{subtitle}
					{scope === "series" && currentSeries?.status === "active" ? (
						<span className='ml-1 inline-flex align-middle'>
							<InfoHint label='How ranking works'>
								<RankingRuleHint
									requiredBets={leaderboard[0]?.required_bets ?? 0}
								/>
							</InfoHint>
						</span>
					) : null}
				</p>
			</div>

			<SeriesScopeToggle
				value={scope}
				onValueChange={setScope}
				seriesTitle={currentSeries?.title}
			/>

			<div className='flex flex-col gap-3'>
				<TopThreePodium
					top={podium}
					currentPlayerId={player?.id ?? ""}
					isLoading={
						scope === "series"
							? !!currentSeriesId && isLeaderboardLoading
							: isOverallLoading
					}
				/>

				{scope === "series" ? (
					<LeaderboardList
						entries={currentSeriesId ? leaderboard : []}
						currentPlayerId={player?.id ?? ""}
						isLoading={!!currentSeriesId && isLeaderboardLoading}
						onRowClick={openProfile}
					/>
				) : (
					<OverallStandingsList
						entries={overall}
						currentPlayerId={player?.id ?? ""}
						isLoading={isOverallLoading}
						onRowClick={openProfile}
					/>
				)}
			</div>

			{isProfileDialogOpen ? (
				<Suspense fallback={null}>
					<PlayerProfileDialog
						roomId={room.id}
						playerId={selectedPlayerId}
						open={isProfileDialogOpen}
						onOpenChange={(open) => {
							setIsProfileDialogOpen(open);
							if (!open) setSelectedPlayerId(null);
						}}
					/>
				</Suspense>
			) : null}
		</div>
	);
}
