import { MapPinIcon } from "lucide-react";
import { usePredictionMatchResult } from "@/features/predictions/hooks/prediction";
import { summarizeMatch } from "@/shared/lib/matchScore";
import { cn } from "@/shared/lib/utils";

type Props = {
	roomId: string;
	predictionId: string;
	// Only questions from an event pack with a result have a match to show.
	enabled: boolean;
};

// The match an event pack question came from and how it ended, under the
// question's result: the score (or cricket totals), then what else happened
// (half time, extra time, the shootout, the toss) and where it was played.
// Shows once Crow has confirmed the match; nothing before that.
export function MatchResultCard({ roomId, predictionId, enabled }: Readonly<Props>) {
	const { data: match } = usePredictionMatchResult(roomId, predictionId, enabled);
	if (!match) return null;
	const summary = summarizeMatch(match);
	if (!summary) return null;

	const calledOff = summary.sides.length === 0;
	const state = calledOff ? "Called off" : match.sport === "cricket" ? "Result" : "Full time";
	// The round reads best ("Matchweek 13"); a cricket match's own name
	// ("1st ODI") when it has one.
	const round = match.label ?? match.round;

	return (
		<section aria-label='Match result' className='flex flex-col gap-3 rounded-2xl border p-4'>
			<div className='flex items-center justify-between gap-3'>
				<span className='shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold'>
					{state}
				</span>
				<span className='min-w-0 truncate text-xs text-muted-foreground'>
					{round ? `${match.competition}, ${round}` : match.competition}
				</span>
			</div>

			{summary.sides.length > 0 ? (
				<ul className='flex flex-col gap-1.5'>
					{summary.sides.map((side) => {
						// Bold for the side that won; both plain for a draw.
						const someoneWon = summary.sides.some((s) => s.won);
						const muted = someoneWon && !side.won;
						return (
							<li key={side.side} className='flex items-baseline justify-between gap-3'>
								<span
									className={cn(
										"min-w-0 truncate text-base",
										side.won ? "font-semibold" : "font-medium",
										muted && "text-muted-foreground",
									)}
								>
									{side.name}
								</span>
								<span className='flex shrink-0 items-baseline gap-1.5 tabular-nums'>
									<span
										className={cn(
											"text-2xl font-bold leading-none",
											muted && "text-muted-foreground",
										)}
									>
										{side.score}
									</span>
									{side.detail ? (
										<span className='text-xs text-muted-foreground'>{side.detail}</span>
									) : null}
								</span>
							</li>
						);
					})}
				</ul>
			) : null}

			{summary.outcome ? <p className='text-sm font-medium'>{summary.outcome}</p> : null}

			{summary.notes.length > 0 ? (
				<ul className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
					{summary.notes.map((note) => (
						<li key={note}>{note}</li>
					))}
				</ul>
			) : null}

			{match.venue ? (
				<p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
					<MapPinIcon className='size-3.5 shrink-0' aria-hidden='true' />
					<span className='truncate'>{match.venue}</span>
				</p>
			) : null}
		</section>
	);
}
