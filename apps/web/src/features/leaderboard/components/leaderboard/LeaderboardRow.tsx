import type { ReactNode } from "react";
import { betsNeededLabel } from "@/features/leaderboard/lib/standings";
import type { LeaderboardEntry } from "@/features/leaderboard/types/types";
import { capitalize, cn, formatSignedPoints } from "@/shared/lib/utils";
import { FlameIcon } from "lucide-react";
import { Skeleton, SkeletonList } from "@/shared/ui";
import { RankChange } from "./RankChange";

// A standings table is one card: a heading row, then one row per player.
// Two columns only, each two lines tall (the player and what's under their
// name; the number and what's under it), so every row is the same height.
export const STANDINGS_TABLE = "overflow-hidden rounded-2xl border bg-card";
const ROW =
	"grid min-h-14 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t px-3.5 py-2 text-left";

export function StandingsHeading({
	left = "Player",
	right,
}: Readonly<{ left?: string; right: string }>) {
	return (
		<div
			aria-hidden='true'
			className='grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-2.5 px-3.5 py-2 text-xs font-medium text-muted-foreground'
		>
			<span />
			<span>{left}</span>
			<span>{right}</span>
		</div>
	);
}

type StandingRowProps = {
	// The place, or null for players who aren't ranked.
	rank: number | null;
	name: string;
	isSelf: boolean;
	// Small chips after the name: movement, streak, titles.
	chips?: ReactNode;
	// Under the name.
	detail?: ReactNode;
	// The number the table ranks by, and what's under it.
	value: ReactNode;
	valueDetail?: ReactNode;
	onClick?: () => void;
};

export function StandingRow({
	rank,
	name,
	isSelf,
	chips,
	detail,
	value,
	valueDetail,
	onClick,
}: Readonly<StandingRowProps>) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				ROW,
				"cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
				isSelf && "bg-primary/10 hover:bg-primary/15",
			)}
		>
			<span
				className={cn(
					"text-sm font-bold tabular-nums",
					rank === 1
						? "text-rank-1"
						: isSelf
							? "text-foreground"
							: "text-muted-foreground",
				)}
			>
				{rank ?? "–"}
			</span>
			<span className='flex min-w-0 flex-col'>
				<span className='flex min-w-0 items-center gap-2'>
					<span className={cn("truncate text-sm", isSelf ? "font-bold" : "font-medium")}>
						{name}
					</span>
					{chips}
				</span>
				{detail ? (
					<span className='truncate text-xs text-muted-foreground tabular-nums'>
						{detail}
					</span>
				) : null}
			</span>
			<span className='flex flex-col items-end tabular-nums'>
				<span className='text-sm font-semibold'>{value}</span>
				{valueDetail ? <span className='text-xs'>{valueDetail}</span> : null}
			</span>
		</button>
	);
}

// Profit or loss, in its colour.
export function NetPoints({ value }: Readonly<{ value: number }>) {
	return (
		<span
			className={cn(
				value > 0 && "text-win",
				value < 0 && "text-loss",
				value === 0 && "text-muted-foreground",
			)}
		>
			{value < 0 ? `−${Math.abs(value).toLocaleString()}` : formatSignedPoints(value)}
		</span>
	);
}

type Props = {
	entry: LeaderboardEntry;
	currentPlayerId: string;
	onClick?: (playerId: string) => void;
};

// A player in one series: how many they called under the name, their
// points with profit or loss underneath.
export function LeaderboardRow({
	entry,
	currentPlayerId,
	onClick,
}: Readonly<Props>) {
	let detail: ReactNode = null;
	if (!entry.is_ranked) {
		detail = `${capitalize(betsNeededLabel(entry.bets_needed))} to rank`;
	} else if (entry.total_revealed_bets > 0) {
		detail = `${entry.winning_bets} of ${entry.total_revealed_bets} called`;
	}

	return (
		<StandingRow
			rank={entry.rank}
			name={entry.username}
			isSelf={entry.player_id === currentPlayerId}
			chips={
				<>
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
				</>
			}
			detail={detail}
			value={entry.balance.toLocaleString()}
			valueDetail={<NetPoints value={entry.net_profit} />}
			onClick={() => onClick?.(entry.player_id)}
		/>
	);
}

export function StandingsListSkeleton({ count = 5 }: Readonly<{ count?: number }>) {
	return (
		<div aria-hidden='true' className={STANDINGS_TABLE}>
			<div className='flex h-8 items-center justify-between px-3.5'>
				<Skeleton className='ml-7.5 h-3 w-12' />
				<Skeleton className='h-3 w-12' />
			</div>
			<SkeletonList
				count={count}
				renderItem={() => (
					<div className={ROW}>
						<Skeleton className='h-4 w-3' />
						<span className='flex flex-col gap-1.5'>
							<Skeleton className='h-3.5 w-28' />
							<Skeleton className='h-3 w-20' />
						</span>
						<span className='flex flex-col items-end gap-1.5'>
							<Skeleton className='h-3.5 w-12' />
							<Skeleton className='h-3 w-8' />
						</span>
					</div>
				)}
			/>
		</div>
	);
}
