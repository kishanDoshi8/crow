import { useRoomContext } from "@/shared/lib/roomContext";
import { useCurrentSeries } from "@/features/series";
import { useDismissWeeklyRecap, useMyWeeklyRecap } from "@/features/rooms/hooks/home";
import type { MyWeeklyRecap } from "@/shared/lib/api";
import { formatSignedPoints, ordinal } from "@/shared/lib/utils";
import { StatStrip } from "@/shared/ui";
import { ShareWeeklyButton, useSeriesWeeklyRecap } from "@/features/leaderboard";
import { CalendarDaysIcon, XIcon } from "lucide-react";

// The parts of last week worth saying, and only those: one cell each.
function recapStats(recap: MyWeeklyRecap) {
	const stats: { label: string; value: string; tone?: string }[] = [];
	if (recap.newly_ranked && recap.rank !== null) {
		stats.push({ label: "Rank", value: `Now ${ordinal(recap.rank)}`, tone: "text-win" });
	} else if (recap.rank_change && recap.rank !== null) {
		const up = recap.rank_change > 0;
		stats.push({
			label: "Rank",
			value: `${up ? "Up" : "Down"} ${Math.abs(recap.rank_change)} to ${ordinal(recap.rank)}`,
			tone: up ? "text-win" : "text-loss",
		});
	}
	if (recap.balance_change !== 0) {
		stats.push({
			label: "Points",
			value: formatSignedPoints(recap.balance_change),
			tone: recap.balance_change > 0 ? "text-win" : "text-loss",
		});
	}
	return stats;
}

// Last week in this series, once per week: the new standings, how you did,
// and a way to share them. Dismissed, it returns next week.
export function WeeklyRecapCard() {
	const { room } = useRoomContext();
	const { currentSeries, currentSeriesId } = useCurrentSeries(room.id);
	const isActive = currentSeries?.status === "active";
	const { data: recap } = useMyWeeklyRecap(room.id, currentSeriesId);
	const { data: standings } = useSeriesWeeklyRecap(room.id, currentSeriesId, isActive);
	const { mutate: dismiss } = useDismissWeeklyRecap(room.id, currentSeriesId);

	if (!currentSeries || !isActive || !recap) return null;
	const stats = recapStats(recap);
	const hasStandings = !!standings && standings.standings.length > 0;
	if (stats.length === 0 && !hasStandings) return null;

	return (
		<section
			aria-label='Your week'
			className='mt-3 flex items-start gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2.5'
		>
			<span className='flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15'>
				<CalendarDaysIcon className='size-3.5 text-accent' />
			</span>
			<div className='min-w-0 flex-1'>
				<p className='text-xs font-semibold text-muted-foreground'>
					{hasStandings ? `Week ${standings.week_number} standings are in` : "Your week"}
				</p>
				{stats.length > 0 ? <StatStrip stats={stats} className='mt-1.5' /> : null}
				{hasStandings ? (
					<ShareWeeklyButton
						series={currentSeries}
						className='mt-2 h-8 px-3 text-xs'
						label='Share standings'
					/>
				) : null}
			</div>
			<button
				type='button'
				onClick={() => dismiss(recap.week_key)}
				aria-label='Dismiss this week'
				className='-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
			>
				<XIcon className='size-3.5' />
			</button>
		</section>
	);
}
