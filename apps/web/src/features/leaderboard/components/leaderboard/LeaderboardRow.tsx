import { betsNeededLabel } from "@/features/leaderboard/lib/standings";
import type { LeaderboardEntry } from "@/features/leaderboard/types/types";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import { CoinsIcon, FlameIcon } from "lucide-react";
import { Badge, Skeleton, SkeletonList } from "@/shared/ui";
import { RankChange } from "./RankChange";

// Shared by the series and all-series standings rows and their skeletons.
export const STANDINGS_ROW_SHELL =
	"flex items-center gap-3 px-3 py-2.5 rounded-xl border";

type Props = {
	entry: LeaderboardEntry;
	currentPlayerId: string;
	onClick?: (playerId: string) => void;
};

export function LeaderboardRow({
	entry,
	currentPlayerId,
	onClick,
}: Readonly<Props>) {
	const isSelf = entry.player_id === currentPlayerId;
	const initials = entry.username.slice(0, 2).toUpperCase();

	let rankLabel: string;
	if (entry.rank === null) {
		rankLabel = "–";
	} else if (entry.rank === 1) {
		rankLabel = "🥇";
	} else if (entry.rank === 2) {
		rankLabel = "🥈";
	} else if (entry.rank === 3) {
		rankLabel = "🥉";
	} else {
		rankLabel = `#${entry.rank}`;
	}

	return (
		<button
			className={cn(
				STANDINGS_ROW_SHELL,
				"transition-colors",
				isSelf
					? "border-win/30 bg-win/5"
					: "border-transparent hover:bg-accent/25",
				onClick &&
					"cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
			)}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
			onClick={() => onClick?.(entry.player_id)}
			onKeyDown={(event) => {
				if (!onClick) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onClick(entry.player_id);
				}
			}}
		>
			{/* Rank, and movement since Monday */}
			<span className='flex w-8 shrink-0 flex-col items-center text-sm text-muted-foreground tabular-nums'>
				{rankLabel}
				<RankChange change={entry.rank_change} isNew={entry.rank_is_new} />
			</span>

			{/* Avatar */}
			<Avatar size='default' className={cn(isSelf && "ring-1 ring-win")}>
				<AvatarFallback className='text-xs'>{initials}</AvatarFallback>
			</Avatar>

			{/* Name + badges */}
			<div className='flex-1 min-w-0'>
				<p
					className={cn(
						" font-medium truncate text-left",
						isSelf && "text-win",
					)}
				>
					{entry.username}
					{isSelf && (
						<span className='ml-1 text-xs text-muted-foreground font-normal'>
							(You)
						</span>
					)}
					{entry.current_streak >= 3 && (
						<span className={`inline-block`}>
							<Badge
								className={`flex gap-0 items-center justify-center bg-accent/20 text-accent text-xs ml-2`}
							>
								<FlameIcon className={`w-2 h-2 text-rank-3`} />
								{entry.current_streak}
							</Badge>
						</span>
					)}
				</p>
				{entry.is_ranked ? (
					entry.total_revealed_bets > 0 && (
						<p className='text-xs text-muted-foreground tabular-nums text-left'>
							{entry.winning_bets}/{entry.total_revealed_bets} wins
						</p>
					)
				) : (
					<p className='text-xs text-muted-foreground text-left'>
						Not ranked yet · {betsNeededLabel(entry.bets_needed)}
					</p>
				)}
			</div>

			{/* Balance, then profit or loss this series */}
			<div className='flex flex-col items-end gap-0.5 shrink-0 text-right'>
				<p className='font-semibold tabular-nums'>
					<CoinsIcon className='w-4 h-4 text-rank-1 inline-block mr-0.5' />
					{entry.balance.toLocaleString()}
				</p>
				<p
					className={cn(
						"text-xs tabular-nums",
						entry.net_profit > 0 && "text-win",
						entry.net_profit < 0 && "text-loss",
						entry.net_profit === 0 && "text-muted-foreground",
					)}
				>
					{formatSignedPoints(entry.net_profit)}
				</p>
			</div>
		</button>
	);
}

// A standings row's shape: rank, avatar, name over a stat line, points on the
// right. Heights follow the real text lines so rows swap in without a shift.
function StandingsRowSkeleton() {
	return (
		<div className={cn(STANDINGS_ROW_SHELL, "border-transparent")}>
			<span className='flex w-8 shrink-0 justify-center'>
				<Skeleton className='h-4 w-5' />
			</span>
			<Skeleton className='size-8 shrink-0 rounded-full' />
			<div className='flex h-10.5 flex-1 flex-col justify-center gap-2'>
				<Skeleton className='h-4 w-28' />
				<Skeleton className='h-3 w-16' />
			</div>
			<div className='flex h-10.5 flex-col items-end justify-center gap-2'>
				<Skeleton className='h-4 w-14' />
				<Skeleton className='h-3 w-8' />
			</div>
		</div>
	);
}

export function StandingsListSkeleton({ count = 5 }: Readonly<{ count?: number }>) {
	return (
		<SkeletonList
			count={count}
			className='flex flex-col gap-1'
			renderItem={() => <StandingsRowSkeleton />}
		/>
	);
}
