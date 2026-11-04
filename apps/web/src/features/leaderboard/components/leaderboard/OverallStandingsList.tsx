import { Reveal } from "@/shared/ui";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import { TrophyIcon } from "lucide-react";
import type { OverallStandingEntry } from "@/features/leaderboard/types/types";
import { STANDINGS_ROW_SHELL, StandingsListSkeleton } from "./LeaderboardRow";

type Props = {
	entries: OverallStandingEntry[];
	currentPlayerId: string;
	isLoading: boolean;
	onRowClick?: (playerId: string) => void;
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

// Standings across every series: total profit, with titles won alongside.
export function OverallStandingsList({
	entries,
	currentPlayerId,
	isLoading,
	onRowClick,
}: Readonly<Props>) {
	if (isLoading) {
		return <StandingsListSkeleton />;
	}

	if (entries.length === 0) {
		return (
			<div className='flex flex-col items-center gap-2 py-12 text-center'>
				<p className='text-4xl'>🏆</p>
				<p className='text-muted-foreground text-sm'>
					No results yet. They appear once a prediction is settled.
				</p>
			</div>
		);
	}

	return (
		<div className='flex flex-col gap-1'>
			{entries.length > 3 && (
				<div className='my-1 border-t border-border/50' />
			)}
			{entries.map((entry, index) => {
				const isSelf = entry.player_id === currentPlayerId;
				return (
					<Reveal
						key={entry.player_id}
						index={index}
						className='flex flex-col'
					>
						<button
							type='button'
							onClick={() => onRowClick?.(entry.player_id)}
							className={cn(
								STANDINGS_ROW_SHELL,
								"text-left transition-colors",
								isSelf
									? "border-win/30 bg-win/5"
									: "border-transparent hover:bg-accent/25",
							)}
						>
							<span className='w-8 text-center text-sm text-muted-foreground shrink-0 tabular-nums'>
								{MEDALS[entry.rank - 1] ?? `#${entry.rank}`}
							</span>
							<Avatar size='default' className={cn(isSelf && "ring-1 ring-win")}>
								<AvatarFallback className='text-xs'>
									{entry.username.slice(0, 2).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<span className='flex-1 min-w-0'>
								<span
									className={cn(
										"flex items-center gap-2 font-medium truncate",
										isSelf && "text-win",
									)}
								>
									<span className='truncate'>{entry.username}</span>
									{isSelf ? (
										<span className='text-xs text-muted-foreground font-normal'>
											(You)
										</span>
									) : null}
									{entry.titles > 0 ? (
										<span
											className='inline-flex items-center gap-0.5 rounded-md bg-rank-1/15 px-1.5 text-xs text-rank-1'
											aria-label={`${entry.titles} series ${entry.titles === 1 ? "title" : "titles"}`}
										>
											<TrophyIcon className='size-3' />
											{entry.titles}
										</span>
									) : null}
								</span>
								<span className='block text-xs text-muted-foreground tabular-nums'>
									{entry.series_played} series
									{entry.total_revealed_bets > 0
										? ` · ${entry.winning_bets}/${entry.total_revealed_bets} wins`
										: ""}
								</span>
							</span>
							<span
								className={cn(
									"shrink-0 font-semibold tabular-nums",
									entry.net_profit > 0 && "text-win",
									entry.net_profit < 0 && "text-loss",
								)}
							>
								{formatSignedPoints(entry.net_profit)}
							</span>
						</button>
					</Reveal>
				);
			})}
		</div>
	);
}
