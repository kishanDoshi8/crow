import { RoomNextSteps, useRoomRole } from "@/features/rooms";
import type { Prediction } from "@/features/predictions/types/types";
import { useActivePredictions } from "@/features/predictions/hooks/prediction";
import { useBets } from "@/features/predictions/hooks/bet";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Button, Reveal, Skeleton } from "@/shared/ui";
import type {
	CarouselApi} from "@/shared/ui/carousel";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
} from "@/shared/ui/carousel";
import {
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	DotIcon,
	PlusIcon,
	TrophyIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import React from "react";
import { usePlayer } from "@/features/home";
import { useCurrentSeries } from "@/features/series";
import { useRoomActions } from "@/shared/lib/roomActions";
import { PredictionTags } from "@/features/predictions/components/PredictionTags";
import type { Bet } from "@/features/predictions/types/bet";
import { ReactionSummary, usePredictionTalk } from "@/features/talk";
import { PredictionStatusLine } from "@/features/predictions/view/PredictionStatusLine";
import {
	formatPoints,
	optionTone,
	tallyOptions,
	type OptionTally,
} from "@/features/predictions/lib/predictionView";
import { cn } from "@/shared/lib/utils";
import { ShareOpenPredictionsButton } from "@/features/predictions/components/ShareOpenPredictionsButton";

const PREDICTION_CARD_SHELL =
	"mb-4 flex flex-col rounded-xl border bg-card p-4 text-card-foreground";

// ── Per-card component ─────────────────────────────────────────────────────
// Fetches its own bets and room talk so each card in the carousel is
// self-contained. Reads top to bottom: where it stands, the question, the
// options, your stake, then what the room made of it.
function PredictionCard({
	prediction,
	roomId,
	roomCode,
	refetchPredictions,
}: Readonly<{
	prediction: Prediction;
	roomId: string;
	roomCode: string;
	refetchPredictions: () => void;
}>) {
	const { data: bets = [] } = useBets(roomId, prediction.id);
	const { data: player } = usePlayer();
	const { data: talk } = usePredictionTalk(roomId, prediction.id);

	const { options, pool, picks } = tallyOptions(prediction, bets);
	const myBet = bets.find((b) => b.player_id === player?.id);
	const winnerLabel =
		prediction.prediction_options.find((o) => o.id === prediction.winning_option_id)?.label ?? null;
	const topReactions = talk
		? [...talk.reactions].sort((a, b) => b.count - a.count).slice(0, 3)
		: null;

	const getOptionLabel = (optionId: string) =>
		prediction.prediction_options.find((opt) => opt.id === optionId)?.label ?? "in";

	return (
		<Reveal className={cn(PREDICTION_CARD_SHELL, prediction.status === "draft" && "border-primary/40")}>
			<Link
				to={`/rooms/${roomCode}/predictions/${prediction.id}`}
				className='flex flex-col gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			>
				<PredictionStatusLine
					variant='inline'
					prediction={prediction}
					winnerLabel={winnerLabel}
					resolvedByName={null}
					correctedByName={null}
					onDeadline={refetchPredictions}
				/>

				<div>
					{prediction.series_title ? (
						<p className='truncate text-xs text-muted-foreground'>
							#{prediction.series_prediction_number} · {prediction.series_title}
						</p>
					) : null}
					<h3 className='text-lg font-semibold leading-snug'>{prediction.title}</h3>
					<PredictionTags tags={prediction.tags} className='mt-1.5' />
				</div>

				<CardOptions
					status={prediction.status}
					options={options}
					winningOptionId={prediction.winning_option_id ?? null}
					myOptionId={myBet?.option_id ?? null}
				/>

				<p className='text-xs text-muted-foreground tabular-nums'>
					<span className='font-semibold text-foreground'>{formatPoints(pool)}</span> pts pooled ·{" "}
					{picks} {picks === 1 ? "pick" : "picks"}
				</p>

				<div className='flex flex-col gap-2.5 border-t pt-3'>
					<PredictionCardFooter
						prediction={prediction}
						myBet={myBet}
						optionLabel={getOptionLabel}
					/>
					<ReactionSummary
						topReactions={topReactions}
						myReaction={talk?.my_reaction}
						postCount={talk?.posts.length}
					/>
				</div>
			</Link>
		</Reveal>
	);
}

type CardOptionsProps = {
	status: Prediction["status"];
	options: OptionTally[];
	winningOptionId: string | null;
	myOptionId: string | null;
};

// One compact row per option: its colour, label, your pick, and its share of
// the points. Once revealed the winner turns green and the rest go grey.
function CardOptions({ status, options, winningOptionId, myOptionId }: Readonly<CardOptionsProps>) {
	const settled = status === "revealed";
	const voided = status === "no_result" || status === "cancelled";

	return (
		<ul className='flex flex-col gap-2.5' aria-label='Options'>
			{options.map(({ option, index, percent }) => {
				const isWinner = settled && option.id === winningOptionId;
				const tone = optionTone(index);
				const muted = (settled && !isWinner) || voided;
				return (
					<li key={option.id} className={cn("flex flex-col gap-1", settled && !isWinner && "opacity-70")}>
						<span className='flex items-center gap-2 text-sm'>
							{isWinner ? (
								<CheckIcon className='size-3.5 shrink-0 text-win' strokeWidth={3} aria-label='Winner' />
							) : (
								<span
									className={cn("size-2 shrink-0 rounded-full", muted ? "bg-muted-foreground/60" : tone.dot)}
									aria-hidden
								/>
							)}
							<span className='min-w-0 truncate font-medium'>{option.label}</span>
							{option.id === myOptionId ? (
								<span className='shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary'>
									You
								</span>
							) : null}
							<span
								className={cn(
									"ml-auto shrink-0 font-semibold tabular-nums",
									isWinner && "text-win",
								)}
							>
								{percent}%
							</span>
						</span>
						<span className='block h-1 overflow-hidden rounded-full bg-secondary' aria-hidden>
							<span
								className={cn(
									"block h-full rounded-full transition-[width] duration-500",
									isWinner ? "bg-win" : muted ? "bg-muted-foreground/60" : tone.bar,
								)}
								style={{ width: `${percent}%` }}
							/>
						</span>
					</li>
				);
			})}
		</ul>
	);
}

type FooterProps = {
	prediction: Prediction;
	myBet: Bet | undefined;
	optionLabel: (optionId: string) => string | undefined;
};

// One plain line saying where you stand: your stake once you've bet, and how
// it turned out once it's settled.
function PredictionCardFooter({ prediction, myBet, optionLabel }: Readonly<FooterProps>) {
	const pts = (n: number) => `${Math.abs(n).toLocaleString()} pts`;
	let text: string;
	let tone = "text-muted-foreground";
	let showArrow = false;

	if (prediction.status === "draft") {
		showArrow = true;
		tone = myBet ? "text-foreground" : "text-primary font-semibold";
		text = myBet
			? `${pts(myBet.amount)} on ${optionLabel(myBet.option_id)} · tap to change`
			: "Pick a side";
	} else if (prediction.status === "locked") {
		text = myBet
			? `${pts(myBet.amount)} on ${optionLabel(myBet.option_id)} · result pending`
			: "Bets are closed · you sat this one out";
	} else if (prediction.status === "revealed") {
		if (!myBet) {
			text = "You sat this one out";
		} else {
			const net = (myBet.payout ?? 0) - myBet.amount;
			if (myBet.option_id === prediction.winning_option_id) {
				tone = "text-win font-semibold";
				text = `You called it · +${pts(net)}`;
			} else {
				tone = "text-loss";
				text = `You missed it · −${pts(myBet.amount)}`;
			}
		}
	} else {
		text = myBet ? `${pts(myBet.amount)} refunded` : "Nothing staked";
	}

	return (
		<span className={cn("flex items-center justify-between gap-2 text-sm", tone)}>
			<span className='min-w-0 truncate'>{text}</span>
			{showArrow ? <ChevronRightIcon className='size-4 shrink-0' aria-hidden /> : null}
		</span>
	);
}

// The card's shape while predictions load: status, series line, title, two
// options, the pool line and the footer.
function PredictionCardSkeleton() {
	return (
		<div aria-hidden='true' className={PREDICTION_CARD_SHELL}>
			<div className='flex flex-col gap-3'>
				<div className='flex h-5 items-center justify-between'>
					<Skeleton className='h-3.5 w-40' />
					<Skeleton className='h-3.5 w-12' />
				</div>
				<div>
					<div className='flex h-4 items-center'>
						<Skeleton className='h-3 w-32' />
					</div>
					<div className='flex h-7 items-center'>
						<Skeleton className='h-5 w-3/4' />
					</div>
				</div>
				<div className='flex flex-col gap-2.5'>
					{[0, 1].map((option) => (
						<div key={option} className='flex flex-col gap-1'>
							<div className='flex h-5 items-center justify-between'>
								<Skeleton className='h-3.5 w-24' />
								<Skeleton className='h-3.5 w-8' />
							</div>
							<Skeleton className='h-1 w-full rounded-full' />
						</div>
					))}
				</div>
				<div className='flex h-4 items-center'>
					<Skeleton className='h-3 w-36' />
				</div>
				<div className='flex h-8 items-center border-t pt-3'>
					<Skeleton className='h-3.5 w-44' />
				</div>
			</div>
		</div>
	);
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({
	predictions,
	action,
}: Readonly<{ predictions: Prediction[]; action?: React.ReactNode }>) {
	const activeCount = predictions.filter(
		(p) => p.status === "draft" || p.status === "locked",
	).length;

	if (activeCount > 0) {
		return (
			<div className={`flex items-center justify-between gap-2 my-4`}>
				<div className={`flex flex-col`}>
					<div className={`flex flex-1 items-center gap-2`}>
						<span
							className={`h-2 w-2 rounded-full bg-primary animate-pulse`}
						/>
						<h2 className={`text-lg font-semibold`}>What's Hot</h2>
					</div>
					<div className={`text-xs text-muted-foreground`}>
						{activeCount} active
					</div>
				</div>
				{action}
			</div>
		);
	}

	// Fallback: completed prediction
	const fallback = predictions[0];
	if (!fallback) return null;

	if (action) {
		return (
			<div className={`flex items-center gap-2 my-4`}>
				<h2 className={`flex-1 text-lg font-semibold`}>Last Played</h2>
				{action}
			</div>
		);
	}

	if (fallback.status === "revealed") {
		return (
			<h2
				className={`my-4 flex items-center gap-2 text-lg font-semibold`}
			>
				Last Played
			</h2>
		);
	}
	if (fallback.status === "cancelled") {
		return (
			<h2
				className={`my-4 flex items-center gap-2 text-lg font-semibold text-muted-foreground`}
			>
				<DotIcon
					className={`inline-block text-muted-foreground animate-pulse`}
				/>
				Cancelled
			</h2>
		);
	}
	return (
		<h2
			className={`my-4 flex items-center gap-2 text-lg font-semibold text-muted-foreground`}
		>
			<DotIcon
				className={`inline-block text-muted-foreground animate-pulse`}
			/>
			No Result
		</h2>
	);
}

type InPlayPredictionsProps = {
	predictionsOverride?: Prediction[];
	emptyMessage?: string;
	showSectionHeader?: boolean;
};

// ── Main component ─────────────────────────────────────────────────────────
function InPlayPredictions({
	predictionsOverride,
	emptyMessage,
	showSectionHeader = true,
}: Readonly<InPlayPredictionsProps> = {}) {
	const { room } = useRoomContext();
	// Home follows the series picked in the room header.
	const { currentSeries, currentSeriesId, seriesOptions } = useCurrentSeries(
		room.id,
	);
	const { openSeriesPicker } = useRoomActions();
	const {
		data: queriedPredictions = [],
		isPending: isQueriedPredictionLoading,
		refetch,
	} = useActivePredictions(
		room.id,
		currentSeriesId ?? undefined,
		predictionsOverride === undefined,
	);
	const isOrganizer = useRoomRole(room).can.organize;
	const hasActiveSeries = currentSeries?.status === "active";
	let newPredictionAction: React.ReactNode = null;
	if (isOrganizer && hasActiveSeries) {
		newPredictionAction = (
			<Button variant='linear' size='sm' asChild>
				<Link
					to={`/rooms/${room.code}/predictions/new`}
					state={{ seriesId: currentSeries.id }}
				>
					<PlusIcon />
					New prediction
				</Link>
			</Button>
		);
	} else if (isOrganizer && !currentSeries) {
		newPredictionAction = (
			<Button variant='linear' size='sm' asChild>
				<Link to={`/rooms/${room.code}/series/new`}>
					<PlusIcon />
					Start a series
				</Link>
			</Button>
		);
	}
	let defaultEmptyMessage =
		"No predictions yet. The host will start one soon!";
	const isSeriesFinished =
		currentSeries?.status === "completed" ||
		currentSeries?.status === "archived";
	const otherLiveSeries = seriesOptions.find(
		(series) => series.status === "active" && series.id !== currentSeriesId,
	);
	if (!currentSeries) {
		defaultEmptyMessage = isOrganizer
			? "Start a series to open the first predictions."
			: "No series yet. Your host will start one soon.";
	} else if (isSeriesFinished) {
		defaultEmptyMessage = `${currentSeries.title} has finished.`;
	} else if (currentSeries.status === "draft") {
		defaultEmptyMessage = "This series hasn't started yet.";
	}
	// A finished series points to its final standings, and to the live one.
	const finishedSeriesActions = isSeriesFinished ? (
		<div className='flex flex-wrap justify-center gap-2 pb-2'>
			<Button
				size='sm'
				variant='outline'
				className='text-foreground'
				asChild
			>
				<Link to={`/rooms/${room.code}/leaderboard`}>
					<TrophyIcon />
					Final standings
				</Link>
			</Button>
			{otherLiveSeries ? (
				<Button size='sm' variant='linear' onClick={openSeriesPicker}>
					Switch series
				</Button>
			) : null}
		</div>
	) : null;
	const predictions = predictionsOverride ?? queriedPredictions;
	const isPredictionLoading =
		predictionsOverride === undefined ? isQueriedPredictionLoading : false;
	const refetchPredictions =
		predictionsOverride === undefined ? refetch : () => {};

	// Organizers get a share button for nudging the group chat while
	// something is open, beside "New prediction".
	const hasOpenPrediction = predictions.some((p) => p.status === "draft");
	const headerAction =
		isOrganizer && hasOpenPrediction ? (
			<div className='flex items-center gap-2'>
				<ShareOpenPredictionsButton
					roomName={room.name}
					roomCode={room.code}
					predictions={predictions}
				/>
				{newPredictionAction}
			</div>
		) : (
			newPredictionAction
		);

	const [api, setApi] = React.useState<CarouselApi>();
	const [current, setCurrent] = React.useState(0);

	React.useEffect(() => {
		if (!api) return;

		const storageKey = `room-${room.id}-predictions-carousel-index`;
		const maxIndex = Math.max(predictions.length - 1, 0);

		let initialIndex = 0;

		try {
			const raw = localStorage.getItem(storageKey);
			const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);

			if (Number.isInteger(parsed)) {
				// Clamp to valid range [0, maxIndex]
				initialIndex = Math.min(Math.max(parsed, 0), maxIndex);
			}
		} catch {
			initialIndex = 0;
		}

		api.scrollTo(initialIndex);
		setCurrent(initialIndex);

		const onSelect = () => {
			const selected = api.selectedScrollSnap();
			setCurrent(selected);
			try {
				localStorage.setItem(storageKey, String(selected));
			} catch {
				// ignore storage errors
			}
		};

		api.on("select", onSelect);

		return () => {
			api.off("select", onSelect);
		};
	}, [api, room.id, predictions.length]);

	let carouselContent;
	if (isPredictionLoading) {
		carouselContent = (
			<CarouselItem>
				<PredictionCardSkeleton />
			</CarouselItem>
		);
	} else if (predictions.length === 0) {
		carouselContent = (
			<CarouselItem>
				<div
					className={`border-2 border-activity/30 rounded-xl p-4 flex flex-col gap-2 bg-secondary text-accent-foreground w-full`}
				>
					<p className={`text-muted-foreground text-center py-4`}>
						{emptyMessage ?? defaultEmptyMessage}
					</p>
					{predictionsOverride === undefined
						? (finishedSeriesActions ??
							(newPredictionAction ? (
								<div className='flex justify-center pb-2'>
									{newPredictionAction}
								</div>
							) : (
								<RoomNextSteps className='pb-2' />
							)))
						: null}
				</div>
			</CarouselItem>
		);
	} else {
		carouselContent = predictions.map((prediction) => (
			<CarouselItem key={prediction.id}>
				<PredictionCard
					prediction={prediction}
					roomId={room.id}
					roomCode={room.code}
					refetchPredictions={refetchPredictions}
				/>
			</CarouselItem>
		));
	}

	return (
		<div className={`max-w-lg mx-auto`}>
			{showSectionHeader && isPredictionLoading && (
				<div
					aria-hidden='true'
					className={`flex items-center justify-between gap-2 my-4`}
				>
					<div className={`flex flex-col gap-1.5`}>
						<Skeleton className={`h-5.5 w-28`} />
						<Skeleton className={`h-3 w-14`} />
					</div>
				</div>
			)}

			{showSectionHeader &&
				!isPredictionLoading &&
				predictions.length > 0 && (
					<SectionHeader
						predictions={predictions}
						action={predictionsOverride === undefined ? headerAction : undefined}
					/>
				)}

			<Carousel
				opts={{ align: "start" }}
				className={`w-full`}
				setApi={setApi}
			>
				<CarouselContent>{carouselContent}</CarouselContent>
			</Carousel>

			<div className={`flex justify-between items-center  px-2`}>
				{predictions.length > 1 && (
					<button
						onClick={() => api?.scrollPrev()}
						aria-label='Previous'
					>
						<ChevronLeftIcon className={`text-foreground/75`} />
					</button>
				)}

				{/* Dot indicators */}
				<div className='flex justify-center gap-2 mt-2 mx-auto'>
					{isPredictionLoading && (
						<Skeleton className={`h-2 w-6 rounded-full`} />
					)}
					{Array.from({ length: predictions.length }).map(
						(_, index) => (
							<button
								key={index}
								onClick={() => api?.scrollTo(index)}
								className={`h-2 rounded-full transition-all duration-300 ${
									index === current
										? "w-6 bg-primary"
										: "w-2 bg-muted-foreground/80"
								}`}
								aria-label={`Go to slide ${index + 1}`}
							/>
						),
					)}
				</div>

				{predictions.length > 1 && (
					<button onClick={() => api?.scrollNext()} aria-label='Next'>
						<ChevronRightIcon className={`text-foreground/75`} />
					</button>
				)}
			</div>
		</div>
	);
}

export default InPlayPredictions;
