import { Link } from "react-router-dom";
import { LockIcon } from "lucide-react";
import type { Prediction } from "@/features/predictions/types/types";
import type { Bet } from "@/features/predictions/types/bet";
import { formatPoints } from "@/features/predictions/lib/predictionView";
import { describeDeadline } from "@/shared/lib/deadline";
import { capitalize, cn } from "@/shared/lib/utils";
import { Reveal } from "@/shared/ui";

// A match card shows this many questions; past it, the first few and a
// "+N more" row.
const ROWS_ALL_UP_TO = 5;
const ROWS_SHOWN = 4;

// One card for a set of questions about one match ("Arsenal vs Spurs"):
// where you are with it, then a row per question with your pick or a way to
// make it. Each row opens its question; the details (options, split, Room
// talk) live there, and Next question walks you through the rest.
export function MatchCard({
	title,
	predictions,
	picks,
	roomCode,
}: Readonly<{
	title: string;
	predictions: Prediction[];
	picks: Map<string, Bet | undefined>;
	roomCode: string;
}>) {
	const open = predictions.filter((prediction) => prediction.status === "draft");
	const pickedOpen = open.filter((prediction) => picks.get(prediction.id)).length;
	const hasToPick = pickedOpen < open.length;
	const firstClose = open[0] ? new Date(open[0].deadline) : null;
	const pickedAll = predictions.filter((prediction) => picks.get(prediction.id)).length;

	const rows =
		predictions.length <= ROWS_ALL_UP_TO ? predictions : predictions.slice(0, ROWS_SHOWN);
	const hidden = predictions.slice(rows.length);
	// "+N more" opens the first hidden one still to pick, else the first.
	const moreTarget = hidden.find((p) => p.status === "draft" && !picks.get(p.id)) ?? hidden[0];

	return (
		<Reveal
			className={cn(
				"mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground",
				hasToPick && "border-primary/40",
			)}
		>
			<div>
				<h3 className='text-lg font-semibold leading-snug text-balance'>{title}</h3>
				<p className='mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground'>
					<span className='truncate'>
						{firstClose
							? `Closes ${capitalize(describeDeadline(firstClose).when.replace(" at ", " "))}`
							: "Picks locked"}
					</span>
					<span className='shrink-0 tabular-nums'>
						{open.length > 0
							? `${pickedOpen} of ${open.length} picked`
							: `${pickedAll} of ${predictions.length} picked`}
					</span>
				</p>
			</div>

			{/* The tally: a segment per question, filled once you've picked it. */}
			<div className='flex gap-1' aria-hidden='true'>
				{predictions.map((prediction) => {
					const picked = !!picks.get(prediction.id);
					return (
						<span
							key={prediction.id}
							className={cn(
								"h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
								picked ? "bg-primary" : prediction.status === "draft" ? "bg-muted-foreground/30" : "bg-muted-foreground/15",
							)}
						/>
					);
				})}
			</div>

			<ul className='-mx-1 flex flex-col divide-y divide-border'>
				{rows.map((prediction) => (
					<li key={prediction.id}>
						<MatchRow
							prediction={prediction}
							pick={picks.get(prediction.id)}
							roomCode={roomCode}
							matchTitle={title}
						/>
					</li>
				))}
				{moreTarget ? (
					<li>
						<Link
							to={`/rooms/${roomCode}/predictions/${moreTarget.id}`}
							className='flex min-h-11 items-center rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
						>
							+{hidden.length} more
						</Link>
					</li>
				) : null}
			</ul>
		</Reveal>
	);
}

// Inside the match's card, "Who wins Arsenal vs Spurs? (90 minutes)" can
// drop the match: "Who wins? (90 minutes)", "Do both teams score?".
export function withoutMatch(title: string, match: string) {
	if (!match) return title;
	const short = title
		.split(` in ${match}`).join("")
		.split(` ${match}`).join("")
		.replace(/\s+([?.!])/g, "$1")
		.trim();
	return short.length > 0 ? short : title;
}

function MatchRow({
	prediction,
	pick,
	roomCode,
	matchTitle,
}: Readonly<{ prediction: Prediction; pick: Bet | undefined; roomCode: string; matchTitle: string }>) {
	const isOpen = prediction.status === "draft";
	const pickLabel = pick
		? (prediction.prediction_options.find((option) => option.id === pick.option_id)?.label ?? "Your pick")
		: null;

	let aside;
	if (pick) {
		aside = (
			<span className='flex shrink-0 flex-col items-end text-right'>
				<span className='flex max-w-36 items-center gap-1 truncate text-sm font-semibold'>
					{!isOpen ? <LockIcon aria-label='Locked' className='size-3 shrink-0 text-muted-foreground' /> : null}
					<span className='truncate'>{pickLabel}</span>
				</span>
				<span className='text-xs text-muted-foreground tabular-nums'>{formatPoints(pick.amount)} pts</span>
			</span>
		);
	} else if (isOpen) {
		aside = (
			<span className='shrink-0 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary'>
				Call it
			</span>
		);
	} else {
		aside = <span className='shrink-0 text-xs text-muted-foreground'>No pick</span>;
	}

	return (
		<Link
			to={`/rooms/${roomCode}/predictions/${prediction.id}`}
			className='flex min-h-12 items-center justify-between gap-3 rounded-md px-1 py-2 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring'
		>
			<span className={cn('line-clamp-2 min-w-0 text-sm', pick || !isOpen ? 'text-muted-foreground' : 'font-medium')}>
				{withoutMatch(prediction.title, matchTitle)}
			</span>
			{aside}
		</Link>
	);
}
