import { Badge, FadeContent, Reveal, Skeleton } from "@/shared/ui";
import {
	ChevronRightIcon,
	CrosshairIcon,
	CrownIcon,
	FlameIcon,
	TrophyIcon,
} from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";
import type {
	LeaderboardEntry} from "@/features/leaderboard";
import {
	betsNeededLabel,
	RankChange,
	splitStandings,
	useSeriesLeaderboard,
} from "@/features/leaderboard";
import { useCurrentSeries } from "@/features/series";
import type { Room } from "@/features/rooms";
import { twColor } from "@/shared/lib/utils";
import { Link } from "react-router-dom";
import { useAppNavigation } from "@/shared/lib/navigation";

const PlayerProfileDialog = lazy(() =>
	import("@/features/leaderboard/components/player/PlayerProfileDialog").then(
		(module) => ({ default: module.PlayerProfileDialog }),
	),
);

type UserStatsProps = {
	title?: string;
	subtitle?: string;
	leaderboardEntriesOverride?: LeaderboardEntry[];
	isLeaderboardLoadingOverride?: boolean;
	showSeeAllLink?: boolean;
};

function UserStats({
	title = "Standings",
	subtitle = "Top balance when the series closes wins the title",
	leaderboardEntriesOverride,
	isLeaderboardLoadingOverride,
	showSeeAllLink = true,
}: Readonly<UserStatsProps>) {
	const { room } = useRoomContext();
	const { currentSeriesId } = useCurrentSeries(room.id);

	const { data: seriesLeaderboard = [], isPending: isSeriesLeaderboardLoading } =
		useSeriesLeaderboard(
			room.id,
			currentSeriesId,
			leaderboardEntriesOverride === undefined,
		);

	const leaderboard =
		leaderboardEntriesOverride ?? (currentSeriesId ? seriesLeaderboard : []);
	const isLeaderboardLoading =
		isLeaderboardLoadingOverride ??
		(!!currentSeriesId && isSeriesLeaderboardLoading);

	return (
		<div className={`w-full max-w-md mx-auto`}>
			<h2 className={`text-lg font-semibold`}>{title}</h2>
			<p className={`text-xs text-muted-foreground mb-4`}>{subtitle}</p>
			<LeaderboardContent
				leaderboard={leaderboard}
				isLoading={isLeaderboardLoading}
				room={room}
				showSeeAllLink={showSeeAllLink}
			/>
		</div>
	);
}

function LeaderboardContent({
	leaderboard,
	isLoading,
	room,
	showSeeAllLink = true,
}: Readonly<{
	leaderboard: LeaderboardEntry[];
	isLoading: boolean;
	room: Room;
	showSeeAllLink?: boolean;
}>) {
	const { data: player } = usePlayer();
	const [leaderboardPlayer, setLeaderboardPlayer] =
		useState<LeaderboardEntry | null>(null);
	const [gapToNextPlayer, setGapToNextPlayer] =
		useState<LeaderboardEntry | null>(null);
	const metricValue = (entry: LeaderboardEntry) => entry.balance ?? 0;
	const currentMetric = leaderboardPlayer
		? metricValue(leaderboardPlayer)
		: 0;
	const gapMetric =
		leaderboardPlayer && gapToNextPlayer
			? metricValue(gapToNextPlayer) - metricValue(leaderboardPlayer)
			: 0;

	useEffect(() => {
		if (!player || leaderboard.length === 0) {
			setLeaderboardPlayer(null);
			setGapToNextPlayer(null);
			return;
		}

		const currentPlayerEntry =
			leaderboard.find((entry) => entry.player_id === player.id) ?? null;
		setLeaderboardPlayer(currentPlayerEntry);

		const rank = currentPlayerEntry?.rank ?? null;
		if (rank === null || rank === 1) {
			setGapToNextPlayer(null);
			return;
		}

		const nextPlayer =
			leaderboard.find((entry) => entry.rank === rank - 1) ?? null;
		setGapToNextPlayer(nextPlayer);
	}, [leaderboard, player]);

	const playerId = player?.id;

	return (
		<LeaderboardContentView
			leaderboard={leaderboard}
			isLoading={isLoading}
			room={room}
			playerId={playerId}
			leaderboardPlayer={leaderboardPlayer}
			gapToNextPlayer={gapToNextPlayer}
			currentMetric={currentMetric}
			gapMetric={gapMetric}
			metricValue={metricValue}
			showSeeAllLink={showSeeAllLink}
		/>
	);
}

function LeaderboardContentView({
	leaderboard,
	isLoading,
	room,
	playerId,
	leaderboardPlayer,
	gapToNextPlayer,
	currentMetric,
	gapMetric,
	metricValue,
	showSeeAllLink,
}: Readonly<{
	leaderboard: LeaderboardEntry[];
	isLoading: boolean;
	room: Room;
	playerId?: string;
	leaderboardPlayer: LeaderboardEntry | null;
	gapToNextPlayer: LeaderboardEntry | null;
	currentMetric: number;
	gapMetric: number;
	metricValue: (entry: LeaderboardEntry) => number;
	showSeeAllLink: boolean;
}>) {
	return (
		<div className={`flex flex-col gap-4`}>
			<div
				className={`text-card-foreground flex flex-col gap-6 rounded-xl border shadow-sm relative overflow-hidden border-border bg-linear-to-br from-card to-primary/5 p-5`}
			>
				<div className={`flex gap-4 items-center`}>
					{isLoading ? (
						<Skeleton
							className={`w-14 h-14 rounded-lg bg-secondary animate-pulse`}
						/>
					) : (
						<FadeContent
							className={`relative w-14 h-14 flex items-center justify-center rounded-lg font-bold text-foreground text-2xl ${leaderboardPlayer?.rank === 1 ? "bg-rank-1 text-secondary" : "bg-linear-to-r from-primary to-accent"}`}
						>
							{leaderboardPlayer?.rank ? `#${leaderboardPlayer.rank}` : "—"}
							{leaderboardPlayer?.rank === 1 && (
								<span>
									<CrownIcon
										className={`w-6 h-6 text-rank-1 absolute -top-2 border border-rank-1 -right-2 bg-background rounded-full p-1`}
									/>
								</span>
							)}
						</FadeContent>
					)}

					{isLoading ? (
						<div className={`flex-1`}>
							<Skeleton
								className={`w-1/2 h-4 rounded-lg bg-secondary animate-pulse mb-2`}
							/>
							<Skeleton
								className={`w-1/2 h-8 rounded-lg bg-secondary animate-pulse`}
							/>
						</div>
					) : (
						<FadeContent
							className={`flex-1`}
						>
							<p className={`text-xs`}>YOUR POINTS</p>
							<p className={`text-3xl font-extrabold`}>
								{currentMetric.toLocaleString()}
							</p>
							{leaderboardPlayer && !leaderboardPlayer.is_ranked ? (
								<p className={`text-xs text-muted-foreground`}>
									Not ranked yet ·{" "}
									{betsNeededLabel(leaderboardPlayer.bets_needed)}
								</p>
							) : leaderboardPlayer?.rank_is_new ||
							  leaderboardPlayer?.rank_change != null ? (
								<p className={`flex items-center gap-1 text-xs text-muted-foreground`}>
									<RankChange
										change={leaderboardPlayer.rank_change}
										isNew={leaderboardPlayer.rank_is_new}
									/>
									<span aria-hidden='true'>since Monday</span>
								</p>
							) : null}
						</FadeContent>
					)}

					{isLoading ? (
						<Skeleton
							className={`w-20 h-10 rounded-lg bg-secondary animate-pulse`}
						/>
					) : (
						<>
							{leaderboardPlayer &&
								gapToNextPlayer &&
								gapMetric > 0 && (
									<FadeContent
										className={`flex flex-col gap-1`}
									>
										<p
											className={`text-xs justify-end flex items-center gap-1 text-muted-foreground`}
										>
											GAP TO #{gapToNextPlayer.rank}
										</p>
										<p
											className={`text-lg font-bold justify-end flex items-center gap-1 text-accent`}
										>
											+{gapMetric.toLocaleString()}
										</p>
									</FadeContent>
								)}
						</>
					)}
				</div>

				{isLoading ? (
					<div className={`flex flex-col gap-2`}>
						{[1, 2, 3, 4].map((i) => (
							<div
								key={i}
								className={`flex items-center gap-3 p-3 rounded-lg bg-secondary/60 animate-pulse`}
							>
								<Skeleton
									className={`w-6 h-6 text-sm font-bold rounded-md bg-secondary animate-pulse`}
								/>
								<Skeleton
									className={`w-1/4 h-4 rounded-lg bg-secondary animate-pulse`}
								/>
								<Skeleton
									className={`ml-auto w-10 h-4 rounded-lg bg-secondary animate-pulse`}
								/>
							</div>
						))}
						<Skeleton
							className={`h-6 w-20 ml-auto bg-secondary rounded-lg mt-2`}
						/>
					</div>
				) : (
					<LeaderboardMiniRows
						leaderboard={leaderboard}
						playerId={playerId}
						roomCode={room.code}
						metricValue={metricValue}
						showSeeAllLink={showSeeAllLink}
					/>
				)}
			</div>

			{isLoading ? (
				<div className={`flex gap-2`}>
					{[1, 2, 3].map((i) => (
						<Skeleton
							key={i}
							className={`flex-1 w-full h-24 rounded-lg bg-secondary animate-pulse`}
						/>
					))}
				</div>
			) : (
				<FadeContent
					className={`flex gap-2`}
				>
					<StatTile
						icon={<TrophyIcon className={`w-4 h-4 text-rank-1`} />}
						value={leaderboardPlayer?.winning_bets ?? 0}
						label='WINS'
					/>
					<StatTile
						icon={<CrosshairIcon className={`w-4 h-4 text-loss`} />}
						value={`${Math.round(leaderboardPlayer?.win_percentage ?? 0)}%`}
						label='ACCURACY'
					/>
					<StatTile
						icon={<FlameIcon className={`w-4 h-4 text-rank-3`} />}
						value={
							leaderboardPlayer?.current_streak === 0
								? (leaderboardPlayer?.highest_streak ?? 0)
								: (leaderboardPlayer?.current_streak ?? 0)
						}
						label={`${
							leaderboardPlayer?.current_streak === 0
								? "BEST STREAK"
								: "STREAK"
						}`}
					/>
				</FadeContent>
			)}
		</div>
	);
}

function getRankChipStyle(rank: number) {
	if (rank === 1) {
		return {
			backgroundColor: twColor("rank-1", 0.1),
			color: twColor("rank-1"),
		};
	}

	if (rank === 2) {
		return {
			backgroundColor: twColor("rank-2", 0.2),
			color: twColor("foreground"),
		};
	}

	if (rank === 3) {
		return {
			backgroundColor: twColor("rank-3", 0.2),
			color: twColor("rank-3"),
		};
	}

	return {
		backgroundColor: twColor("foreground", 0.001),
		color: twColor("foreground"),
	};
}

function LeaderboardMiniRows({
	leaderboard,
	playerId,
	roomCode,
	metricValue,
	showSeeAllLink,
}: Readonly<{
	leaderboard: LeaderboardEntry[];
	playerId?: string;
	roomCode: string;
	metricValue: (entry: LeaderboardEntry) => number;
	showSeeAllLink: boolean;
}>) {
	const { room } = useRoomContext();
	const { switchTab } = useAppNavigation();
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
		null,
	);
	const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

	return (
		<div className={`flex flex-col gap-2`}>
			{splitStandings(leaderboard).ranked.slice(0, 4).map((entry, index) => {
				const rankChipStyle = getRankChipStyle(entry.rank);

				return (
					<button
						key={entry.player_id}
						onClick={() => {
							setSelectedPlayerId(entry.player_id);
							setIsProfileDialogOpen(true);
						}}
						className={`cursor-pointer`}
					>
						<Reveal
							index={index}
							className={`flex items-center gap-3 p-3 rounded-lg ${entry.player_id === playerId ? "bg-linear-30 from-accent/10 border to-primary/10" : "bg-secondary/60"}`}
						>
							<p
								className={`w-6 h-6 text-sm font-bold rounded-md flex items-center justify-center`}
								style={rankChipStyle}
							>
								{entry.rank}
							</p>
							<RankChange
								change={entry.rank_change}
								isNew={entry.rank_is_new}
								className='-ml-1'
							/>
							<p className={`font-medium`}>
								{entry.username}
								{entry.current_streak >= 3 && (
									<span className={`inline-block`}>
										<Badge
											className={`flex gap-0 items-center justify-center bg-accent/20 text-accent text-xs ml-2`}
										>
											<FlameIcon
												className={`w-2 h-2 text-rank-3`}
											/>
											{entry.current_streak}
										</Badge>
									</span>
								)}
								{entry.player_id === playerId && (
									<Badge
										variant='outline'
										className={`ml-3 text-xs rounded-md`}
									>
										You
									</Badge>
								)}
							</p>
							<p className={`ml-auto font-bold`}>
								{metricValue(entry).toLocaleString()}
								<span
									className={`text-xs ml-1 text-muted-foreground font-normal`}
								>
									pts
								</span>
							</p>
						</Reveal>
					</button>
				);
			})}
			{showSeeAllLink ? (
				<Link
					to={`/rooms/${roomCode}/leaderboard`}
					onClick={(event) => {
						// Standings is a tab: it sits one entry above Home.
						event.preventDefault();
						switchTab(`/rooms/${roomCode}/leaderboard`);
					}}
					className={`flex items-center justify-end text-sm text-accent text-right mt-2 cursor-pointer`}
				>
					see all
					<ChevronRightIcon className={`w-3 h-3 inline-block ml-1`} />
				</Link>
			) : null}

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

function StatTile({
	icon: Icon,
	value,
	label,
}: Readonly<{ icon: React.ReactNode; value: string | number; label: string }>) {
	return (
		<div
			className={`flex flex-col bg-card p-3 rounded-lg border flex-1 items-center `}
		>
			{Icon}
			<p className={`text-2xl font-bold mt-1`}>{value}</p>
			<p className={`text-[10px]`}>{label}</p>
		</div>
	);
}

export default UserStats;
