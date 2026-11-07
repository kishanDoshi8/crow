import { useRoomContext } from "@/shared/lib/roomContext";
import { useCurrentSeries } from "@/features/series";
import {
	useMarkResultsSeen,
	useUnseenResults,
} from "@/features/rooms/hooks/home";
import type { UnseenResult } from "@/shared/lib/api";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui";
import { CheckIcon, CircleSlashIcon, XIcon } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { Link } from "react-router-dom";

const VISIBLE_ROWS = 3;

function outcomeOf(result: UnseenResult) {
	if (result.status === "no_result") {
		return {
			Icon: CircleSlashIcon,
			tone: "text-muted-foreground",
			ring: "bg-muted",
			value: "Refunded",
		};
	}
	const won = result.net > 0;
	return won
		? {
				Icon: CheckIcon,
				tone: "text-win",
				ring: "bg-win/15",
				value: `${formatSignedPoints(result.net)} pts`,
			}
		: {
				Icon: XIcon,
				tone: "text-loss",
				ring: "bg-loss/15",
				value: `${formatSignedPoints(result.net)} pts`,
			};
}

// How your recent bets in this series turned out. Dismissing a row brings
// the next one up; each result shows once.
export function ResultsCard() {
	const { room } = useRoomContext();
	const { currentSeries, currentSeriesId } = useCurrentSeries(room.id);
	const { data: results = [], isPending } = useUnseenResults(
		room.id,
		currentSeriesId,
	);
	const { mutate: markSeen } = useMarkResultsSeen(room.id, currentSeriesId);

	if (!currentSeries) return null;
	if (isPending) {
		return <Skeleton aria-hidden='true' className='mt-3 h-14 rounded-xl' />;
	}

	const visible = results.slice(0, VISIBLE_ROWS);
	const more = results.length - visible.length;

	return (
		<section
			aria-label='Your results'
			className='max-w-md mx-auto mt-3 rounded-xl border border-border/60 bg-card px-3 py-2.5'
		>
			<div className='flex items-center justify-between gap-2'>
				<h3 className='text-xs font-semibold text-muted-foreground'>
					{results.length > 0 ? "Your results" : "Results"}
				</h3>
				{results.length > 1 ? (
					<button
						type='button'
						onClick={() =>
							markSeen(results.map((r) => r.prediction_id))
						}
						className='text-xs font-medium text-muted-foreground hover:text-foreground'
					>
						Dismiss all
					</button>
				) : null}
			</div>

			{results.length === 0 ? (
				<p className='mt-1 text-sm text-muted-foreground'>
					You're all caught up. New results show up here.
				</p>
			) : (
				<ul className='mt-1.5 flex flex-col'>
					<AnimatePresence initial={false}>
						{visible.map((result) => {
							const outcome = outcomeOf(result);
							return (
								<m.li
									key={result.prediction_id}
									layout
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, x: 24 }}
									transition={{ duration: 0.18 }}
									className='flex items-center gap-2.5 py-1.5'
								>
									<span
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-full",
											outcome.ring,
										)}
									>
										<outcome.Icon
											className={cn(
												"size-3.5",
												outcome.tone,
											)}
										/>
									</span>
									<Link
										to={`/rooms/${room.code}/predictions/${result.prediction_id}`}
										className='min-w-0 flex-1'
									>
										<p className='truncate text-sm font-medium'>
											{result.title}
										</p>
										<p className='truncate text-xs text-muted-foreground'>
											You picked {result.my_pick}
											{result.winning_label &&
											result.status === "revealed"
												? ` · ${result.winning_label} won`
												: ""}
										</p>
									</Link>
									<span
										className={cn(
											"shrink-0 text-sm font-semibold tabular-nums",
											outcome.tone,
										)}
									>
										{outcome.value}
									</span>
									<button
										type='button'
										onClick={() =>
											markSeen([result.prediction_id])
										}
										aria-label={`Dismiss ${result.title}`}
										className='-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
									>
										<XIcon className='size-3.5' />
									</button>
								</m.li>
							);
						})}
					</AnimatePresence>
					{more > 0 ? (
						<li className='pt-1 text-xs text-muted-foreground'>
							+{more} more
						</li>
					) : null}
				</ul>
			)}
		</section>
	);
}
