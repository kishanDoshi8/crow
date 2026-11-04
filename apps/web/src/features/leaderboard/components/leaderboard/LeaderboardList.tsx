import { Reveal } from "@/shared/ui";
import type { LeaderboardEntry } from "@/features/leaderboard/types/types";
import { rankingRuleLabel, splitStandings } from "@/features/leaderboard/lib/standings";
import { LeaderboardRow, StandingsListSkeleton } from "./LeaderboardRow";

type Props = {
	entries: LeaderboardEntry[];
	currentPlayerId: string;
	isLoading: boolean;
	onRowClick?: (playerId: string) => void;
};

export function LeaderboardList({
	entries,
	currentPlayerId,
	isLoading,
	onRowClick,
}: Readonly<Props>) {
	if (isLoading) {
		return <StandingsListSkeleton />;
	}

	const { ranked, unranked } = splitStandings(entries);

	if (entries.length === 0) {
		return (
			<div className='flex flex-col items-center gap-2 py-12 text-center'>
				<p className='text-4xl'>🏆</p>
				<p className='text-muted-foreground text-sm'>
					No standings yet. They appear once a series starts.
				</p>
			</div>
		);
	}

	return (
		<div className='flex flex-col gap-2'>
			{/* Divider */}
			{ranked.length > 3 && (
				<div className='my-1 border-t border-border/50' />
			)}

			{ranked.length > 0 ? (
				<div className='flex flex-col gap-1'>
					{ranked.map((entry, index) => (
						<Reveal
							key={entry.player_id}
							index={index}
							className='flex flex-col'
						>
							<LeaderboardRow
								entry={entry}
								currentPlayerId={currentPlayerId}
								onClick={onRowClick}
							/>
						</Reveal>
					))}
				</div>
			) : (
				<p className='py-6 text-center text-sm text-muted-foreground'>
					Nobody is ranked yet.
				</p>
			)}

			{/* Players short of the minimum bets, kept out of the standings */}
			{unranked.length > 0 && (
				<div className='mt-4 flex flex-col gap-1'>
					<div className='px-3'>
						<p className='font-medium'>Not ranked yet</p>
						<p className='text-xs text-muted-foreground'>
							{rankingRuleLabel(unranked[0].required_bets)}
						</p>
					</div>
					<div className='flex flex-col gap-1 opacity-75'>
						{unranked.map((entry) => (
							<LeaderboardRow
								key={entry.player_id}
								entry={entry}
								currentPlayerId={currentPlayerId}
								onClick={onRowClick}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
