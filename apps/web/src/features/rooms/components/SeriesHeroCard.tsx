import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";
import {
	betsNeededLabel,
	RankChange,
	splitStandings,
	useSeriesLeaderboard,
	ShareStandingsButton,
} from "@/features/leaderboard";
import { useActivePredictions } from "@/features/predictions";
import {
	SeriesStatusBadge,
	useCurrentSeries,
	useSeriesWallet,
} from "@/features/series";
import { TrophyIcon } from "lucide-react";
import { describeDeadline } from "@/shared/lib/deadline";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import { Reveal, Skeleton } from "@/shared/ui";
import { ChevronRightIcon, Clock } from "lucide-react";
import { InfoHint } from "@/shared/ui";
import { RankingRuleHint } from "@/features/leaderboard";
import { Link } from "react-router-dom";

// Desktop puts it in a wider column, which it fills.
const HERO_SHELL = "w-full max-w-md mx-auto rounded-2xl border bg-card p-4 mt-4 lg:max-w-none";

// Where you stand in the series you're looking at, and what locks next.
export function SeriesHeroCard() {
	const { room } = useRoomContext();
	const { data: player } = usePlayer();
	const {
		currentSeries,
		currentSeriesId,
		isPending: isSeriesLoading,
	} = useCurrentSeries(room.id);
	const { wallet, isPending: isWalletLoading } = useSeriesWallet(
		room.id,
		currentSeriesId,
	);
	const { data: standings = [] } = useSeriesLeaderboard(
		room.id,
		currentSeriesId,
	);
	const { data: predictions = [] } = useActivePredictions(
		room.id,
		currentSeriesId ?? undefined,
	);

	if (isSeriesLoading || (currentSeriesId && isWalletLoading)) {
		return <SeriesHeroCardSkeleton />;
	}
	if (!currentSeries || !wallet) return null;

	const { ranked } = splitStandings(standings);
	const me = standings.find((entry) => entry.player_id === player?.id);
	const myRank = me?.rank;
	const champion = ranked[0];
	const now = Date.now();
	const nextLock = predictions
		.filter(
			(prediction) =>
				prediction.status === "draft" &&
				new Date(prediction.deadline).getTime() > now,
		)
		.sort(
			(a, b) =>
				new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
		)[0];
	const nextLockWhen = nextLock
		? describeDeadline(new Date(nextLock.deadline)).when
		: null;

	return (
		<Reveal
			as='section'
			aria-label={`${currentSeries.title} summary`}
			className={HERO_SHELL}
		>
			<div className='flex items-center justify-between gap-2'>
				<p className='truncate text-sm font-medium text-muted-foreground'>
					{currentSeries.title}
				</p>
				<SeriesStatusBadge status={currentSeries.status} />
			</div>

			<div className='mt-2 flex items-end justify-between gap-4'>
				<div>
					<p className='text-xs text-muted-foreground'>Your rank</p>
					<p className='text-3xl font-bold leading-tight'>
						{myRank ? `#${myRank}` : "–"}
						{myRank && ranked.length > 0 ? (
							<span className='ml-2 text-base font-medium text-muted-foreground'>
								of {ranked.length}
							</span>
						) : null}
						{me ? (
							<RankChange
								change={me.rank_change}
								isNew={me.rank_is_new}
								className='ml-2 align-middle'
							/>
						) : null}
					</p>
					{me && !me.is_ranked ? (
						<p className='flex items-center gap-1 text-xs text-muted-foreground'>
							Not ranked yet · {betsNeededLabel(me.bets_needed)}
							<InfoHint label='How ranking works'>
								<RankingRuleHint requiredBets={me.required_bets} />
							</InfoHint>
						</p>
					) : null}
				</div>
				<div className='text-right'>
					<p className='text-xs text-muted-foreground'>Balance</p>
					<p className='text-3xl font-bold leading-tight'>
						{wallet.balance.toLocaleString()}
						<span className='ml-1 text-base font-medium text-muted-foreground'>
							pts
						</span>
					</p>
					<p
						className={cn(
							"text-xs font-medium",
							wallet.net_profit > 0
								? "text-win"
								: wallet.net_profit < 0
									? "text-destructive"
									: "text-muted-foreground",
						)}
					>
						{formatSignedPoints(wallet.net_profit)} this series
					</p>
				</div>
			</div>

			<p className='mt-2 text-xs text-muted-foreground'>
				{wallet.escrow.toLocaleString()} in play ·{" "}
				{wallet.available.toLocaleString()} to spend
			</p>

			{currentSeries.status === "completed" && champion ? (
				<div className='mt-3 flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2'>
					<TrophyIcon className='size-4 shrink-0 text-accent' />
					<p className='min-w-0 flex-1 truncate text-sm'>
						<span className='font-semibold'>{champion.username}</span> took
						the title
					</p>
					<ShareStandingsButton
						series={currentSeries}
						className='h-8 px-3 text-xs'
						label='Share'
					/>
				</div>
			) : null}

			{nextLock && nextLockWhen ? (
				<Link
					to={`/rooms/${room.code}/predictions/${nextLock.id}`}
					className='mt-3 flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
				>
					<Clock className='size-4 shrink-0 text-muted-foreground' />
					<span className='min-w-0 flex-1'>
						<span className='block truncate font-medium'>
							{nextLock.title}
						</span>
						<span className='block text-xs text-muted-foreground'>
							Locks {nextLockWhen}
						</span>
					</span>
					<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' />
				</Link>
			) : null}
		</Reveal>
	);
}

// Same card with placeholders: title + status, rank and balance, the points
// line, and one row for what locks next (the usual case mid-series).
function SeriesHeroCardSkeleton() {
	return (
		<div aria-hidden='true' className={HERO_SHELL}>
			<div className='flex h-5.5 items-center justify-between gap-2'>
				<Skeleton className='h-3.5 w-32' />
				<Skeleton className='h-5.5 w-16 rounded-full' />
			</div>
			<div className='mt-2 flex items-end justify-between gap-4'>
				<div className='flex flex-col gap-1'>
					<Skeleton className='h-3 w-16' />
					<Skeleton className='h-8.5 w-20' />
				</div>
				<div className='flex flex-col items-end gap-1'>
					<Skeleton className='h-3 w-14' />
					<Skeleton className='h-8.5 w-28' />
					<Skeleton className='h-3 w-24' />
				</div>
			</div>
			<Skeleton className='mt-3 h-3 w-40' />
			<Skeleton className='mt-3 h-13 w-full rounded-xl' />
		</div>
	);
}
