import { cn } from "@/shared/lib/utils";
import type { LeaderboardEntry } from "@/features/leaderboard/types/types";
import { rankingRuleLabel, splitStandings } from "@/features/leaderboard/lib/standings";
import {
	LeaderboardRow,
	STANDINGS_TABLE,
	StandingsHeading,
	StandingsListSkeleton,
} from "./LeaderboardRow";

type Props = {
	entries: LeaderboardEntry[];
	currentPlayerId: string;
	isLoading: boolean;
	onRowClick?: (playerId: string) => void;
	// The podium stands directly on the table: square off its top corners.
	attachTop?: boolean;
};

// One series' table: everyone ranked (the podium's three included, so the
// list is complete), then the players still short of the minimum bets.
export function LeaderboardList({
	entries,
	currentPlayerId,
	isLoading,
	onRowClick,
	attachTop = false,
}: Readonly<Props>) {
	if (isLoading) {
		return <StandingsListSkeleton />;
	}

	const { ranked, unranked } = splitStandings(entries);

	if (entries.length === 0) {
		return (
			<p className='py-12 text-center text-sm text-muted-foreground'>
				No standings yet. They appear once a series starts.
			</p>
		);
	}

	return (
		<div className='flex flex-col gap-5'>
			{ranked.length > 0 ? (
				<div className={cn(STANDINGS_TABLE, attachTop && "rounded-t-none")}>
					<StandingsHeading right='Points' />
					<ol>
						{ranked.map((entry) => (
							<li key={entry.player_id}>
								<LeaderboardRow
									entry={entry}
									currentPlayerId={currentPlayerId}
									onClick={onRowClick}
								/>
							</li>
						))}
					</ol>
				</div>
			) : (
				<p className='py-6 text-center text-sm text-muted-foreground'>
					Nobody is ranked yet.
				</p>
			)}

			{unranked.length > 0 ? (
				<section className='flex flex-col gap-2'>
					<div>
						<h3 className='text-sm font-semibold'>Not ranked yet</h3>
						<p className='text-xs text-muted-foreground'>
							{rankingRuleLabel(unranked[0].required_bets)}
						</p>
					</div>
					<ol className={`${STANDINGS_TABLE} [&>li:first-child>button]:border-t-0`}>
						{unranked.map((entry) => (
							<li key={entry.player_id}>
								<LeaderboardRow
									entry={entry}
									currentPlayerId={currentPlayerId}
									onClick={onRowClick}
								/>
							</li>
						))}
					</ol>
				</section>
			) : null}
		</div>
	);
}
