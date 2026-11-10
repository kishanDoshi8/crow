import { FadeContent, Skeleton, StatStrip } from "@/shared/ui";
import { ChevronRightIcon, FlameIcon } from "lucide-react";
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
import { cn, ordinal } from "@/shared/lib/utils";
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
		<div className={`w-full max-w-md mx-auto lg:max-w-none`}>
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
	const rank = leaderboardPlayer?.rank ?? null;
	const onStreak = (leaderboardPlayer?.current_streak ?? 0) > 0;

	return (
		<div className={`flex flex-col gap-3`}>
			<div className='overflow-hidden rounded-2xl border bg-card'>
				{/* Your place: rank, points, and how far the next place up is. */}
				<div className='flex items-center gap-3.5 p-3.5'>
					{isLoading ? (
						<Skeleton className='size-14 shrink-0 rounded-xl' />
					) : (
						<FadeContent
							className={cn(
								"flex size-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold",
								rank === 1
									? "bg-rank-1 text-brand-ink"
									: "bg-linear-to-r from-primary to-accent text-foreground",
							)}
						>
							{rank ? ordinal(rank) : "–"}
						</FadeContent>
					)}

					{isLoading ? (
						<div className='flex flex-1 flex-col gap-1.5'>
							<Skeleton className='h-3 w-20' />
							<Skeleton className='h-7 w-24' />
						</div>
					) : (
						<FadeContent className='min-w-0 flex-1'>
							<p className='text-xs text-muted-foreground'>Your points</p>
							<p className='text-[1.75rem] font-bold leading-tight tabular-nums'>
								{currentMetric.toLocaleString()}
							</p>
							{leaderboardPlayer && !leaderboardPlayer.is_ranked ? (
								<p className='text-xs text-muted-foreground'>
									Not ranked yet, {betsNeededLabel(leaderboardPlayer.bets_needed)}
								</p>
							) : null}
						</FadeContent>
					)}

					{!isLoading && leaderboardPlayer && gapToNextPlayer && gapMetric > 0 ? (
						<FadeContent className='flex shrink-0 flex-col items-end'>
							<p className='text-xs text-muted-foreground'>
								Gap to {gapToNextPlayer.rank ? ordinal(gapToNextPlayer.rank) : "next"}
							</p>
							<p className='text-xl font-bold leading-snug text-accent tabular-nums'>
								{gapMetric.toLocaleString()}
							</p>
						</FadeContent>
					) : null}
				</div>

				{isLoading ? (
					<div aria-hidden='true'>
						{[1, 2, 3, 4].map((i) => (
							<div key={i} className={STANDING_ROW}>
								<Skeleton className='h-4 w-4' />
								<Skeleton className='h-4 w-1/3' />
								<Skeleton className='ml-auto h-4 w-12' />
							</div>
						))}
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
				<Skeleton className='h-16 w-full rounded-xl' />
			) : (
				<FadeContent>
					<StatStrip
						size='lg'
						className='bg-card'
						stats={[
							{ label: "Wins", value: leaderboardPlayer?.winning_bets ?? 0 },
							{
								label: "Accuracy",
								value: `${Math.round(leaderboardPlayer?.win_percentage ?? 0)}%`,
							},
							{
								label: onStreak ? "Streak" : "Best streak",
								value: onStreak
									? (leaderboardPlayer?.current_streak ?? 0)
									: (leaderboardPlayer?.highest_streak ?? 0),
								tone: onStreak ? "text-accent" : undefined,
							},
						]}
					/>
				</FadeContent>
			)}
		</div>
	);
}

// One line per player: place, name, points. The name gives way (it
// truncates) so the points always line up.
const STANDING_ROW = "flex min-h-11 w-full items-center gap-2.5 border-t px-3.5 text-left";

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

	const ranked = splitStandings(leaderboard).ranked;

	return (
		<div className='flex flex-col'>
			<ol>
				{ranked.slice(0, 5).map((entry) => {
					const isMe = entry.player_id === playerId;
					return (
						<li key={entry.player_id}>
							<button
								type='button'
								onClick={() => {
									setSelectedPlayerId(entry.player_id);
									setIsProfileDialogOpen(true);
								}}
								className={cn(
									STANDING_ROW,
									"cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
									isMe && "bg-primary/10 hover:bg-primary/15",
								)}
							>
								<span
									className={cn(
										"w-5 shrink-0 text-sm font-bold tabular-nums",
										entry.rank === 1
											? "text-rank-1"
											: isMe
												? "text-foreground"
												: "text-muted-foreground",
									)}
								>
									{entry.rank}
								</span>
								<span className='flex min-w-0 flex-1 items-center gap-2'>
									<span className={cn("truncate text-sm", isMe ? "font-bold" : "font-medium")}>
										{entry.username}
									</span>
									{/* Only when the place changed since Monday. */}
									<RankChange pill change={entry.rank_change} isNew={entry.rank_is_new} />
									{entry.current_streak >= 3 ? (
										<span
											className='flex shrink-0 items-center gap-0.5 rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold leading-[18px] text-accent tabular-nums'
											aria-label={`${entry.current_streak} wins in a row`}
										>
											<FlameIcon className='size-3' aria-hidden='true' />
											{entry.current_streak}
										</span>
									) : null}
								</span>
								<span className='shrink-0 text-sm font-semibold tabular-nums'>
									{metricValue(entry).toLocaleString()}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
			{showSeeAllLink ? (
				<Link
					to={`/rooms/${roomCode}/leaderboard`}
					onClick={(event) => {
						// Standings is a tab: it sits one entry above Home.
						event.preventDefault();
						switchTab(`/rooms/${roomCode}/leaderboard`);
					}}
					className={cn(STANDING_ROW, "justify-between text-sm font-medium")}
				>
					{ranked.length > 5 ? `See all ${ranked.length}` : "See the full standings"}
					<ChevronRightIcon className='size-4 text-muted-foreground' aria-hidden='true' />
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

export default UserStats;
