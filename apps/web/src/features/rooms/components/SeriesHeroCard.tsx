import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";
import {
	betsNeededLabel,
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
import { capitalize, cn, formatSignedPoints, ordinal } from "@/shared/lib/utils";
import { Reveal, Skeleton } from "@/shared/ui";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, Clock } from "lucide-react";
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

	// What the balance is made of: free to bet, and held on open bets.
	const spendShare =
		wallet.balance > 0 ? Math.round((wallet.available / wallet.balance) * 100) : 100;
	const netTone =
		wallet.net_profit > 0
			? "text-win"
			: wallet.net_profit < 0
				? "text-destructive"
				: "text-muted-foreground";

	return (
		<Reveal
			as='section'
			aria-label={`${currentSeries.title} summary`}
			className={HERO_SHELL}
		>
			<div className='flex items-center justify-between gap-2'>
				<p className='truncate text-sm font-medium text-muted-foreground'>
					Where you stand
				</p>
				<SeriesStatusBadge status={currentSeries.status} />
			</div>

			<div className='mt-3 grid grid-cols-2'>
				<div className='flex flex-col gap-1 pr-3'>
					<p className='text-3xl font-bold leading-none'>
						{myRank ? ordinal(myRank) : "–"}
					</p>
					{me && !me.is_ranked ? (
						<>
							<p className='text-xs text-muted-foreground'>Not ranked yet</p>
							<p className='flex items-center gap-1 text-xs font-medium'>
								{capitalize(betsNeededLabel(me.bets_needed))}
								<InfoHint label='How ranking works'>
									<RankingRuleHint requiredBets={me.required_bets} />
								</InfoHint>
							</p>
						</>
					) : (
						<>
							<p className='text-xs text-muted-foreground'>
								{ranked.length > 0 ? `of ${ranked.length} ranked` : "Rank"}
							</p>
							{me ? <RankMovement change={me.rank_change} isNew={me.rank_is_new} /> : null}
						</>
					)}
				</div>
				<div className='flex flex-col gap-1 border-l pl-4'>
					<p className='text-3xl font-bold leading-none tabular-nums'>
						{wallet.balance.toLocaleString()}
					</p>
					<p className='text-xs text-muted-foreground'>points</p>
					<p className={cn("text-xs font-semibold tabular-nums", netTone)}>
						{formatSignedPoints(wallet.net_profit)} this series
					</p>
				</div>
			</div>

			<div className='mt-4 flex flex-col gap-1.5'>
				<div
					role='img'
					aria-label={`${wallet.available.toLocaleString()} points to spend, ${wallet.escrow.toLocaleString()} in play`}
					className='flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-secondary'
				>
					<span className='rounded-full bg-foreground' style={{ width: `${spendShare}%` }} />
					{wallet.escrow > 0 ? <span className='flex-1 rounded-full bg-accent' /> : null}
				</div>
				<div className='flex items-center justify-between gap-3 text-xs tabular-nums'>
					<p>
						<span className='font-semibold'>{wallet.available.toLocaleString()}</span>{" "}
						<span className='text-muted-foreground'>to spend</span>
					</p>
					<p>
						<span className='text-muted-foreground'>in play</span>{" "}
						<span className={cn("font-semibold", wallet.escrow > 0 && "text-accent")}>
							{wallet.escrow.toLocaleString()}
						</span>
					</p>
				</div>
			</div>

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
						<span className='block text-xs text-muted-foreground'>
							Locks next, {nextLockWhen}
						</span>
						<span className='block truncate font-medium'>
							{nextLock.title}
						</span>
					</span>
					<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' />
				</Link>
			) : null}
		</Reveal>
	);
}

// "Up 2 since Monday", in words so it reads without the colour.
function RankMovement({
	change,
	isNew,
}: Readonly<{ change: number | null | undefined; isNew: boolean | undefined }>) {
	if (isNew) {
		return <p className='text-xs font-semibold text-activity'>New this week</p>;
	}
	if (!change) return null;
	const up = change > 0;
	const Icon = up ? ChevronUpIcon : ChevronDownIcon;
	return (
		<p className={cn("flex items-center gap-0.5 text-xs font-semibold", up ? "text-win" : "text-loss")}>
			<Icon className='size-3.5' strokeWidth={3} aria-hidden='true' />
			{up ? "Up" : "Down"} {Math.abs(change)} since Monday
		</p>
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
