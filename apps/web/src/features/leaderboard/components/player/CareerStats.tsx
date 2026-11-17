import type { RoomMemberStats } from "../../types/types";
import { Reveal, Skeleton } from "@/shared/ui";
import type { ReactNode } from "react";

type Props = {
	stats: RoomMemberStats | undefined;
	isLoading: boolean;
};

const STAT_TILE =
	"flex min-w-0 flex-col gap-0.5 rounded-xl border border-border/60 bg-card px-3 py-2.5";

function StatTile({
	label,
	value,
	detail,
	index,
}: {
	label: string;
	value: ReactNode;
	detail?: ReactNode;
	index: number;
}) {
	return (
		<Reveal index={index} className={STAT_TILE}>
			<p className='truncate text-xs text-muted-foreground'>{label}</p>
			<p className='truncate text-xl font-semibold tabular-nums text-foreground'>
				{value}
			</p>
			{detail ? (
				<p className='truncate text-[11px] tabular-nums text-muted-foreground'>
					{detail}
				</p>
			) : null}
		</Reveal>
	);
}

function CareerStatsSkeleton() {
	return (
		<div aria-hidden='true' className='grid grid-cols-2 gap-2'>
			{Array.from({ length: 4 }).map((_, i) => (
				<div key={i} className={STAT_TILE}>
					<Skeleton className='my-0.5 h-3 w-16' />
					<Skeleton className='my-1 h-5 w-14' />
				</div>
			))}
		</div>
	);
}

// Room-career numbers: four tiles, no charts.
export function CareerStats({ stats, isLoading }: Readonly<Props>) {
	if (isLoading || !stats) return <CareerStatsSkeleton />;

	const rated = stats.total_rated_predictions ?? 0;
	const wins = stats.winning_predictions ?? 0;
	const winRate = rated > 0 ? `${Math.round((wins / rated) * 100)}%` : "–";
	const hasBestWin = (stats.largest_win_payout ?? 0) > 0;

	return (
		<div className='grid grid-cols-2 gap-2'>
			<StatTile
				index={0}
				label='Win rate'
				value={winRate}
				detail={rated > 0 ? `${wins} of ${rated} called` : undefined}
			/>
			<StatTile
				index={1}
				label='Picks'
				value={(stats.total_predictions ?? 0).toLocaleString()}
			/>
			<StatTile
				index={2}
				label='All-time points'
				value={`${(stats.current_points ?? 0).toLocaleString()}`}
				detail='pts'
			/>
			<StatTile
				index={3}
				label='Best call'
				value={
					hasBestWin
						? `×${(stats.largest_win_multiplier ?? 0).toFixed(1)}`
						: "–"
				}
				detail={
					hasBestWin
						? `${stats.largest_win_payout.toLocaleString()} pts from ${stats.largest_win_bet.toLocaleString()}`
						: undefined
				}
			/>
		</div>
	);
}
