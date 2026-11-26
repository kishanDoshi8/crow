import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import type { Prediction } from "@/features/predictions/types/types";
import type { Bet } from "@/features/predictions/types/bet";
import { formatPoints } from "@/features/predictions/lib/predictionView";
import { previewWinnings } from "@/features/predictions/lib/payoutPreview";
import { useQuestionBets } from "@/features/predictions/hooks/picks";
import { usePickCounts } from "@/features/predictions/hooks/bet";
import { PredictionTags } from "@/features/predictions/components/PredictionTags";
import { describeDeadline } from "@/shared/lib/deadline";
import { capitalize, cn } from "@/shared/lib/utils";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Reveal,
	StatStrip,
} from "@/shared/ui";

// A match card lists every question up to this many; past it, the first
// few and a button that opens them all in a drawer.
const ROWS_ALL_UP_TO = 5;
const ROWS_SHOWN = 4;

// One card for a set of questions about one match ("Arsenal vs Spurs"),
// laid out like a single question's card so they sit well side by side:
// the match and where you are with it, a row per question (your pick, or a
// way to make it), the room's numbers, and your points on the match with
// what they could win. Rows open their question; Next question walks you
// through the rest.
export function MatchCard({
	title,
	predictions,
	picks,
	roomId,
	roomCode,
	playerId,
}: Readonly<{
	title: string;
	predictions: Prediction[];
	picks: Map<string, Bet | undefined>;
	roomId: string;
	roomCode: string;
	playerId?: string;
}>) {
	const [showAll, setShowAll] = useState(false);
	const { bets } = useQuestionBets(roomId, predictions);

	const open = predictions.filter((prediction) => prediction.status === "draft");
	const pickedOpen = open.filter((prediction) => picks.get(prediction.id)).length;
	const myPicks = predictions.filter((prediction) => picks.get(prediction.id));
	const nextToPick = open.find((prediction) => !picks.get(prediction.id));
	const firstClose = open[0] ? new Date(open[0].deadline) : null;
	const first = predictions[0];

	// The room's numbers for the whole match. While any question is open its
	// bets hold only your own pick, so the totals come from the server.
	const anyOpen = open.length > 0;
	const { data: counts } = usePickCounts(
		roomId,
		predictions.map((prediction) => prediction.id),
		anyOpen,
	);
	const allBets = predictions.flatMap((prediction) => bets.get(prediction.id) ?? []);
	const inPlay = anyOpen ? (counts?.pool ?? 0) : allBets.reduce((sum, bet) => sum + bet.amount, 0);
	const players = anyOpen ? (counts?.players ?? 0) : new Set(allBets.map((bet) => bet.player_id)).size;

	// Your points on the match, and what they'd win if every pick comes in.
	// Only once picks close: before that it would show how the others picked.
	const myPoints = myPicks.reduce((sum, prediction) => sum + (picks.get(prediction.id)?.amount ?? 0), 0);
	const upside = playerId && !anyOpen
		? myPicks.reduce((sum, prediction) => {
				const pick = picks.get(prediction.id);
				if (!pick) return sum;
				return sum + previewWinnings(bets.get(prediction.id) ?? [], playerId, pick.option_id, pick.amount);
			}, 0)
		: 0;

	const rows = predictions.length <= ROWS_ALL_UP_TO ? predictions : predictions.slice(0, ROWS_SHOWN);
	const hasMore = rows.length < predictions.length;

	const questionRows = (list: Prediction[]) =>
		list.map((prediction) => (
			<li key={prediction.id}>
				<MatchRow prediction={prediction} pick={picks.get(prediction.id)} roomCode={roomCode} matchTitle={title} />
			</li>
		));

	return (
		<Reveal
			className={cn(
				"mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground",
				nextToPick && "border-primary/40",
			)}
		>
			<div>
				<p className='flex items-baseline justify-between gap-3 text-xs text-muted-foreground'>
					<span className='truncate'>{first?.series_title ?? "Match"}</span>
					<span className='shrink-0 tabular-nums'>
						{open.length > 0
							? `${pickedOpen} of ${open.length} picked`
							: `${myPicks.length} of ${predictions.length} picked`}
					</span>
				</p>
				<h3 className='text-lg font-semibold leading-snug text-balance'>{title}</h3>
				<PredictionTags tags={first?.tags} className='mt-1.5' />
			</div>

			{/* The tally: a segment per question, filled once you've picked it. */}
			<div className='flex gap-1' aria-hidden='true'>
				{predictions.map((prediction) => (
					<span
						key={prediction.id}
						className={cn(
							"h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
							picks.get(prediction.id)
								? "bg-primary"
								: prediction.status === "draft"
									? "bg-muted-foreground/30"
									: "bg-muted-foreground/15",
						)}
					/>
				))}
			</div>

			<ul className='-mx-1 flex flex-col divide-y divide-border'>
				{questionRows(rows)}
				{hasMore ? (
					<li>
						<button
							type='button'
							onClick={() => setShowAll(true)}
							className='flex min-h-11 w-full items-center justify-between rounded-md px-1 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
						>
							All {predictions.length} questions
							<ChevronRightIcon className='size-4' aria-hidden />
						</button>
					</li>
				) : null}
			</ul>

			<StatStrip
				stats={[
					{ label: "In play", value: formatPoints(inPlay) },
					{ label: "Players", value: players },
					firstClose
						? {
								label: "Closes",
								value: capitalize(describeDeadline(firstClose).when.replace(" at ", " ")),
								grow: 1.8,
							}
						: { label: "Result", value: "Awaited", grow: 1.8 },
				]}
			/>

			<div className='flex items-center justify-between gap-3 border-t pt-3'>
				<span className='flex min-w-0 flex-col'>
					<span className='text-xs text-muted-foreground'>Your picks</span>
					<span className='truncate text-sm font-semibold'>
						{myPicks.length > 0
							? `${formatPoints(myPoints)} pts on ${myPicks.length}`
							: open.length > 0
								? "None yet"
								: "You sat this one out"}
					</span>
					{upside > 0 ? (
						<span className='whitespace-nowrap text-xs text-muted-foreground' title='If all your picks win.'>
							Up to <span className='font-semibold text-win tabular-nums'>≈ +{formatPoints(upside)} pts</span>
						</span>
					) : null}
				</span>
				{nextToPick ? (
					<Link
						to={`/rooms/${roomCode}/predictions/${nextToPick.id}`}
						className='flex h-9 shrink-0 items-center gap-1 rounded-md bg-linear-to-r from-primary to-accent px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
					>
						{myPicks.length > 0 ? "Pick the rest" : "Call it"}
						<ChevronRightIcon className='size-4' aria-hidden />
					</Link>
				) : open.length > 0 ? (
					<span className='flex shrink-0 items-center gap-1 text-sm font-semibold text-win'>
						<CheckIcon className='size-4' aria-hidden />
						All picked
					</span>
				) : null}
			</div>

			{hasMore ? (
				<Drawer open={showAll} onOpenChange={setShowAll}>
					<DrawerContent className='mx-auto sm:max-w-md'>
						<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
							<DrawerTitle>{title}</DrawerTitle>
							<DrawerDescription>
								{open.length > 0
									? `${pickedOpen} of ${open.length} picked${firstClose ? `, closes ${describeDeadline(firstClose).when}` : ""}`
									: "Picks locked"}
							</DrawerDescription>
						</DrawerHeader>
						<ul className='flex max-h-[60dvh] flex-col divide-y divide-border overflow-y-auto px-3 pb-6'>
							{questionRows(predictions)}
						</ul>
					</DrawerContent>
				</Drawer>
			) : null}
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
				<span className='flex max-w-36 items-center gap-1 text-sm font-semibold'>
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
			<span className={cn("line-clamp-2 min-w-0 text-sm", pick || !isOpen ? "text-muted-foreground" : "font-medium")}>
				{withoutMatch(prediction.title, matchTitle)}
			</span>
			{aside}
		</Link>
	);
}
