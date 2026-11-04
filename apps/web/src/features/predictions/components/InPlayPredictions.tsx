import { RoomNextSteps, useRoomRole } from "@/features/rooms";
import { Countdown } from "@/features/predictions/widgets/CountDown";
import type { Prediction } from "@/features/predictions/types/types";
import { useActivePredictions } from "@/features/predictions/hooks/prediction";
import { useBets } from "@/features/predictions/hooks/bet";
import { useRoomContext } from "@/shared/lib/roomContext";
import {
	Badge,
	Button,
	CountUp,
	FadeContent,
	Field,
	FieldLabel,
	Progress,
	Reveal,
	Skeleton,
} from "@/shared/ui";
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
	Clock,
	CrownIcon,
	DotIcon,
	PlusIcon,
	TrophyIcon,
	UsersIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import React from "react";
import { usePlayer } from "@/features/home";
import { useCurrentSeries } from "@/features/series";
import { useRoomActions } from "@/shared/lib/roomActions";
import { PredictionTags } from "@/features/predictions/components/PredictionTags";
import type { Bet } from "@/features/predictions/types/bet";
import { describeDeadline } from "@/shared/lib/deadline";

const PREDICTION_CARD_SHELL =
	"text-card-foreground flex flex-col gap-6 rounded-xl border shadow-sm relative overflow-hidden border-border bg-linear-to-br from-card to-primary/5 p-5 mb-4";

// Threshold (as a percentage) above which an option is labelled "🔥 hot pick"
const HOT_PICK_THRESHOLD_PERCENT = 60;

// ── Per-card component ─────────────────────────────────────────────────────
// Fetches its own bets so each card in the carousel is self-contained.
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

	const betAmountPerOption: Record<string, number> = {};
	for (const bet of bets) {
		betAmountPerOption[bet.option_id] =
			(betAmountPerOption[bet.option_id] ?? 0) + bet.amount;
	}
	const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
	const myBet = bets.find((b) => b.player_id === player?.id);

	const isActive =
		prediction.status === "draft" || prediction.status === "locked";

	let borderClass = "border-border";
	if (prediction.status === "locked") {
		borderClass = "border-primary/50";
	} else if (isActive) {
		borderClass = "border-accent";
	}

	const getOptionLabel = (optionId: string) => {
		const option = prediction.prediction_options.find(
			(opt) => opt.id === optionId,
		);
		return option ? option.label : "in";
	};

	return (
		<Reveal className={`${PREDICTION_CARD_SHELL} ${borderClass}`}>
			<Link to={`/rooms/${roomCode}/predictions/${prediction.id}`}>
				{/* Status badge per card */}
				<div className={`flex items-center gap-2 mb-3`}>
					{prediction.status === "draft" && (
						<>
							<Badge
								variant='secondary'
								className={`text-muted-foreground font-bold text-xs flex items-center gap-1 mr-auto`}
							>
								<Clock />
								COMING UP
							</Badge>
							{prediction.deadline && (
								<FadeContent>
									<Countdown
										targetTime={new Date(
											prediction.deadline,
										).getTime()}
										onExpire={refetchPredictions}
									/>
								</FadeContent>
							)}
						</>
					)}
					{prediction.status === "locked" && (
						<div className='flex items-center gap-2 mr-auto'>
							<Badge
								className={`bg-primary/20 text-primary text-xs flex items-center gap-1`}
							>
								<span
									className={`h-2 w-2 rounded-full bg-primary animate-pulse`}
								/>{" "}
								LIVE
							</Badge>
						</div>
					)}
					{prediction.status === "revealed" && (
						<div className={`flex items-center gap-2`}>
							<Badge
								variant='outline'
								className={`text-win text-xs flex items-center gap-1`}
							>
								<CheckIcon className={`w-3 h-3`} />
								Resolved
							</Badge>
						</div>
					)}
					{prediction.status === "cancelled" && (
						<Badge
							variant='outline'
							className={`text-muted-foreground text-xs flex items-center gap-1`}
						>
							<DotIcon className={`text-muted-foreground`} />
							Cancelled
						</Badge>
					)}
					{prediction.status === "no_result" && (
						<Badge
							variant='outline'
							className={`text-muted-foreground text-xs flex items-center gap-1`}
						>
							<DotIcon className={`text-muted-foreground`} />
							No Result
						</Badge>
					)}
				</div>

				<FadeContent>
					<h6
						className={`text-xs text-muted-foreground font-semibold tracking-wider`}
					>
						{prediction.series_title
							? `#${prediction.series_prediction_number} • ${prediction.series_title}`
							: ""}
					</h6>
				</FadeContent>

				<FadeContent className='mb-4'>
					<h4 className={`text-xl md:text-2xl font-semibold`}>
						{prediction.title}
					</h4>
					<PredictionTags tags={prediction.tags} className='mt-1.5' />
				</FadeContent>

				<FadeContent className={`flex flex-col gap-3 mt-2`}>
					{prediction.prediction_options.map((option) => (
						<Field className='w-full' key={option.id}>
							<FieldLabel
								htmlFor={`progress-${option.id}`}
								className='-mb-2'
							>
								<span className={`flex items-center`}>
									{option.label}
									{prediction.winning_option_id ===
										option.id && (
										<Badge
											variant='outline'
											className=' text-sm flex items-center gap-1 text-win ml-2'
										>
											<CrownIcon
												className={`w-4! h-4!`}
											/>
										</Badge>
									)}
									{/* hot pick label when one option captures HOT_PICK_THRESHOLD_PERCENT% or more of bets */}
									{totalBetAmount > 0 &&
									(betAmountPerOption[option.id] /
										totalBetAmount) *
										100 >=
										HOT_PICK_THRESHOLD_PERCENT ? (
										<Badge
											variant='outline'
											className='ml-1 text-xs'
										>
											🔥 hot pick
										</Badge>
									) : null}
								</span>
								<span className={`ml-auto`}>
									{(
										betAmountPerOption[option.id] ?? 0
									).toLocaleString()}{" "}
									pts
								</span>
							</FieldLabel>
							<Progress
								value={
									totalBetAmount
										? (betAmountPerOption[option.id] /
												totalBetAmount) *
											100
										: 0
								}
								id={`progress-${option.id}`}
							/>
						</Field>
					))}
				</FadeContent>

				<div className={`flex items-center justify-between mt-4`}>
					{/* show total pooled */}
					<FadeContent className={`flex items-center gap-2`}>
						<TrophyIcon
							className={`text-muted-foreground w-3 h-3`}
						/>
						<p className={`text-sm text-muted-foreground`}>
							Pooled:{" "}
							<CountUp
								className={`text-foreground font-semibold`}
								to={totalBetAmount}
								separator=','
							/>{" "}
							pts
						</p>
					</FadeContent>
					{/* total participants */}
					<FadeContent className={`flex items-center gap-2`}>
						<UsersIcon
							className={`text-muted-foreground w-3 h-3`}
						/>
						<span
							className={`text-foreground text-sm font-semibold`}
						>
							{bets.length.toLocaleString()}
						</span>
					</FadeContent>
				</div>

				<PredictionCardFooter
					prediction={prediction}
					myBet={myBet}
					optionLabel={getOptionLabel}
				/>
			</Link>
		</Reveal>
	);
}

type FooterProps = {
	prediction: Prediction;
	myBet: Bet | undefined;
	optionLabel: (optionId: string) => string | undefined;
};

// One plain line under the card saying where you stand: your stake once
// you've bet, and how it turned out once it's settled.
function PredictionCardFooter({ prediction, myBet, optionLabel }: Readonly<FooterProps>) {
	const pts = (n: number) => `${Math.abs(n).toLocaleString()} pts`;
	let text: string;
	let tone = "text-muted-foreground";
	let showArrow = false;

	if (prediction.status === "draft") {
		const locks = describeDeadline(new Date(prediction.deadline)).when;
		showArrow = true;
		tone = "text-foreground";
		text = myBet
			? `${pts(myBet.amount)} on ${optionLabel(myBet.option_id)} · tap to change`
			: `Pick a side · locks ${locks}`;
	} else if (prediction.status === "locked") {
		text = myBet
			? `${pts(myBet.amount)} on ${optionLabel(myBet.option_id)} · result pending`
			: "Bets are closed · you sat this one out";
	} else if (prediction.status === "revealed") {
		const winner = prediction.winning_option_id
			? optionLabel(prediction.winning_option_id)
			: undefined;
		if (!myBet) {
			text = winner ? `${winner} won · you sat this one out` : "Settled";
		} else {
			const net = (myBet.payout ?? 0) - myBet.amount;
			if (myBet.option_id === prediction.winning_option_id) {
				tone = "text-win";
				text = `${winner} won · +${pts(net)}`;
			} else {
				tone = "text-loss";
				text = `${winner} won · you lost ${pts(myBet.amount)}`;
			}
		}
	} else if (prediction.status === "no_result") {
		text = myBet ? `No result · ${pts(myBet.amount)} refunded` : "No result";
	} else {
		text = myBet ? `Cancelled · ${pts(myBet.amount)} refunded` : "Cancelled";
	}

	return (
		<span
			className={`mt-6 flex items-center justify-end text-right text-sm ${tone}`}
		>
			{text}
			{showArrow ? <ChevronRightIcon className='ml-1 inline-block' /> : null}
		</span>
	);
}

// The card's shape while predictions load: status row, series line, title,
// two options with bars, the pool/players row and the call to action.
function PredictionCardSkeleton() {
	return (
		<div aria-hidden='true' className={PREDICTION_CARD_SHELL}>
			<div>
				<div className='mb-3 flex items-center justify-between'>
					<Skeleton className='h-5.5 w-24 rounded-full' />
					<Skeleton className='h-8 w-24 rounded-lg' />
				</div>
				<div className='flex h-4 items-center'>
					<Skeleton className='h-3 w-32' />
				</div>
				<div className='mb-4 flex h-7 items-center md:h-8'>
					<Skeleton className='h-5 w-3/4' />
				</div>
				<div className='mt-2 flex flex-col gap-4'>
					{[0, 1].map((option) => (
						<div key={option} className='flex flex-col gap-3'>
							<div className='flex h-5 items-center justify-between'>
								<Skeleton className='h-3.5 w-24' />
								<Skeleton className='h-3.5 w-12' />
							</div>
							<Skeleton className='h-2 w-full rounded-full' />
						</div>
					))}
				</div>
				<div className='mt-4 flex h-5 items-center justify-between'>
					<Skeleton className='h-3.5 w-28' />
					<Skeleton className='h-3.5 w-8' />
				</div>
				<div className='mt-6 flex h-6 items-center justify-end'>
					<Skeleton className='h-3.5 w-36' />
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
						action={
							predictionsOverride === undefined
								? newPredictionAction
								: undefined
						}
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
