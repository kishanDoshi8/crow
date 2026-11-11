import { cn } from "@/shared/lib/utils";
import { TrophyIcon } from "lucide-react";
import type { OverallStandingEntry } from "@/features/leaderboard/types/types";
import {
	NetPoints,
	STANDINGS_TABLE,
	StandingRow,
	StandingsHeading,
	StandingsListSkeleton,
} from "./LeaderboardRow";

type Props = {
	entries: OverallStandingEntry[];
	currentPlayerId: string;
	isLoading: boolean;
	onRowClick?: (playerId: string) => void;
	// The podium stands directly on the table: square off its top corners.
	attachTop?: boolean;
};

// Standings across every series: total profit, with a trophy chip after the
// name for anyone who has won a title.
export function OverallStandingsList({
	entries,
	currentPlayerId,
	isLoading,
	onRowClick,
	attachTop = false,
}: Readonly<Props>) {
	if (isLoading) {
		return <StandingsListSkeleton />;
	}

	if (entries.length === 0) {
		return (
			<p className='py-12 text-center text-sm text-muted-foreground'>
				No results yet. They appear once a prediction is settled.
			</p>
		);
	}

	return (
		<div className={cn(STANDINGS_TABLE, attachTop && "rounded-t-none")}>
			<StandingsHeading right='Profit' />
			<ol>
				{entries.map((entry) => (
					<li key={entry.player_id}>
						<StandingRow
							rank={entry.rank}
							name={entry.username}
							isSelf={entry.player_id === currentPlayerId}
							chips={
								entry.titles > 0 ? (
									<span
										className='flex shrink-0 items-center gap-0.5 rounded-full bg-rank-1/15 px-1.5 text-[11px] font-semibold leading-[18px] text-rank-1 tabular-nums'
										aria-label={`${entry.titles} series ${entry.titles === 1 ? "title" : "titles"}`}
									>
										<TrophyIcon className='size-3' aria-hidden='true' />
										{entry.titles}
									</span>
								) : null
							}
							detail={`${entry.series_played} series played`}
							value={<NetPoints value={entry.net_profit} />}
							valueDetail={
								entry.total_revealed_bets > 0 ? (
									<span className='text-muted-foreground'>
										{entry.winning_bets} of {entry.total_revealed_bets} called
									</span>
								) : null
							}
							onClick={() => onRowClick?.(entry.player_id)}
						/>
					</li>
				))}
			</ol>
		</div>
	);
}
