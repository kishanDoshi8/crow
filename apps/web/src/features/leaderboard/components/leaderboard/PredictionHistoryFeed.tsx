import type { PredictionHistoryEntry } from "@/features/leaderboard/types/types";
import { Skeleton, SkeletonList } from "@/shared/ui/skeleton";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import { Link } from "react-router-dom";
import { FactTag, Reveal, StatStrip } from "@/shared/ui";
import { useRoomContext } from "@/shared/lib/roomContext";
import { ReactionSummary } from "@/features/talk";

const CARD_SHELL = "flex flex-col gap-3 rounded-2xl border bg-card p-3.5";

type CardProps = {
	entry: PredictionHistoryEntry;
};

// The viewer's own outcome on a finished prediction: the loudest thing on
// the card.
function myResult(entry: PredictionHistoryEntry) {
	const quiet = "bg-muted text-xs font-semibold text-muted-foreground";
	if (entry.my_bet_amount === null) {
		return { label: "Sat out", spoken: "You sat this one out", tone: quiet, border: "" };
	}
	if (entry.status !== "revealed") {
		return { label: "Refunded", spoken: "Your points were refunded", tone: quiet, border: "" };
	}
	const net = (entry.my_payout ?? 0) - entry.my_bet_amount;
	if (net > 0) {
		return {
			label: formatSignedPoints(net),
			spoken: `You won ${net.toLocaleString()} points`,
			tone: "bg-win/15 text-sm font-bold text-win",
			border: "border-win/35",
		};
	}
	if (net < 0) {
		return {
			label: `−${Math.abs(net).toLocaleString()}`,
			spoken: `You lost ${Math.abs(net).toLocaleString()} points`,
			tone: "bg-loss/15 text-sm font-bold text-loss",
			border: "border-loss/35",
		};
	}
	return { label: "±0", spoken: "You broke even", tone: quiet, border: "" };
}

const timeOf = (iso: string) =>
	new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function PredictionHistoryCard({ entry }: Readonly<CardProps>) {
	const { room } = useRoomContext();
	const total =
		entry.options?.reduce((s, o) => s + o.total_bet, 0) ?? entry.total_pool;
	const winner = entry.options?.find((o) => o.id === entry.winning_option_id);
	const participants = entry.participant_count ?? entry.total_bets;
	const winPct =
		participants > 0
			? Math.round((entry.winner_count / participants) * 100)
			: null;
	const revealed = entry.status === "revealed";
	const isUpset = revealed && participants > 0 && (winPct ?? 100) <= 25;
	const isSweep = revealed && (winPct ?? 0) >= 80;
	const pickedWinner = entry.selected_option_id === entry.winning_option_id;
	const result = myResult(entry);
	// The organizer's reason, closed with a full stop so the next sentence reads on.
	const reason = entry.no_result_reason
		? entry.no_result_reason.replace(/[.!?]*$/, ".")
		: "No payout.";

	return (
		<Link
			to={`/rooms/${room.code}/predictions/${entry.prediction_id}`}
			className={cn(
				CARD_SHELL,
				"transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				result.border,
			)}
		>
			{/* Where it sits in its series and how it went for you share a line,
			    so the question below has the card's full width. */}
			<div className='flex flex-col gap-2'>
				<div className='flex items-center justify-between gap-3'>
					<p className='min-w-0 truncate text-xs text-muted-foreground'>
						{entry.series_title}
						{entry.series_title && entry.series_prediction_number ? ", " : ""}
						{entry.series_prediction_number
							? `No. ${entry.series_prediction_number}`
							: ""}
					</p>
					<span
						className={cn(
							"flex min-w-16 shrink-0 items-center justify-center rounded-lg px-2.5 py-0.5 tabular-nums",
							result.tone,
						)}
						aria-label={result.spoken}
					>
						{result.label}
					</span>
				</div>
				<h3 className='text-base font-semibold leading-snug wrap-anywhere'>
					{entry.title}
				</h3>
			</div>

			<div className='flex flex-wrap items-center gap-1.5'>
				{revealed && winner ? (
					<FactTag label='Winner' className='border-win/40 [&>span:last-child]:text-win'>
						{winner.label}
					</FactTag>
				) : (
					<span className='rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground'>
						{entry.status === "cancelled" ? "Cancelled" : "No result"}
					</span>
				)}
				{entry.selected_option_label ? (
					<FactTag
						label='Your pick'
						className={cn(
							revealed && !pickedWinner && "[&>span:last-child]:text-loss",
						)}
					>
						{entry.selected_option_label}
					</FactTag>
				) : null}
				{isUpset ? (
					<span className='rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent'>
						Upset
					</span>
				) : null}
				{isSweep ? (
					<span className='rounded-full bg-activity/15 px-2.5 py-0.5 text-xs font-semibold text-activity'>
						Sweep
					</span>
				) : null}
			</div>

			{revealed ? (
				<>
					{entry.options && total > 0 ? (
						<ul className='flex flex-col gap-1.5' aria-label='How the points were split'>
							{entry.options.map((opt) => {
								const pct = Math.round((opt.total_bet / total) * 100);
								const isWinner = opt.id === entry.winning_option_id;
								return (
									<li
										key={opt.id}
										className='grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_2.5rem] items-center gap-x-2.5 text-xs'
									>
										<span
											className={cn(
												"truncate",
												isWinner ? "font-semibold" : "text-muted-foreground",
											)}
										>
											{opt.label}
										</span>
										<span className='h-1.5 overflow-hidden rounded-full bg-secondary'>
											<span
												className={cn(
													"block h-full rounded-full",
													isWinner ? "bg-win" : "bg-muted-foreground/45",
												)}
												style={{ width: `${pct}%` }}
											/>
										</span>
										<span
											className={cn(
												"text-right tabular-nums",
												isWinner ? "font-semibold text-win" : "text-muted-foreground",
											)}
										>
											{pct}%
										</span>
									</li>
								);
							})}
						</ul>
					) : null}
					<StatStrip
						stats={[
							{ label: "Pool", value: total.toLocaleString() },
							{
								label: "Called it",
								value: participants > 0 ? `${entry.winner_count} of ${participants}` : "Nobody",
								grow: 1.2,
							},
							...(entry.biggest_payout > 0
								? [
										{
											label: "Top win",
											value: `+${entry.biggest_payout.toLocaleString()}`,
											tone: "text-win",
										},
									]
								: []),
						]}
					/>
				</>
			) : (
				<p className='text-xs text-muted-foreground'>
					{reason}
					{participants > 0
						? ` All ${total.toLocaleString()} points went back to ${participants} ${participants === 1 ? "player" : "players"}.`
						: ""}
				</p>
			)}

			<div className='flex items-center justify-between gap-3'>
				<ReactionSummary
					topReactions={entry.top_reactions}
					myReaction={entry.my_reaction}
					postCount={entry.post_count}
				/>
				{entry.resolved_at ? (
					<span className='ml-auto shrink-0 text-xs text-muted-foreground'>
						{timeOf(entry.resolved_at)}
					</span>
				) : null}
			</div>
		</Link>
	);
}

// A resolved card's sections (header, winner, option bars, meta, payout) at
// their real line heights, so the feed doesn't grow when entries arrive.
function PredictionHistoryCardSkeleton() {
	return (
		<div className={CARD_SHELL}>
			<div className='flex flex-col gap-2'>
				<div className='flex h-6 items-center justify-between'>
					<Skeleton className='h-3 w-32' />
					<Skeleton className='h-6 w-16 rounded-lg' />
				</div>
				<div className='flex h-5.5 items-center'>
					<Skeleton className='h-4 w-3/4' />
				</div>
			</div>
			<div className='flex h-6 items-center gap-1.5'>
				<Skeleton className='h-6 w-28 rounded-md' />
				<Skeleton className='h-6 w-24 rounded-md' />
			</div>
			<div className='flex flex-col gap-1.5'>
				{[0, 1].map((option) => (
					<div key={option} className='flex h-4 items-center gap-2.5'>
						<Skeleton className='h-3 w-20' />
						<Skeleton className='h-1.5 flex-1 rounded-full' />
						<Skeleton className='h-3 w-8' />
					</div>
				))}
			</div>
			<Skeleton className='h-13 w-full rounded-xl' />
			<div className='flex h-4 items-center justify-end'>
				<Skeleton className='h-3 w-14' />
			</div>
		</div>
	);
}

export function PredictionHistoryFeedSkeleton({
	count,
}: Readonly<{ count: number }>) {
	return (
		<SkeletonList
			count={count}
			className='flex flex-col gap-4'
			renderItem={() => <PredictionHistoryCardSkeleton />}
		/>
	);
}

// ─── PredictionHistoryFeed ────────────────────────────────────────────────────

type FeedProps = {
	entries: PredictionHistoryEntry[];
	isLoading: boolean;
	emptyMessage?: string;
};

export function PredictionHistoryFeed({
	entries,
	isLoading,
	emptyMessage,
}: Readonly<FeedProps>) {
	if (isLoading) {
		return <PredictionHistoryFeedSkeleton count={4} />;
	}

	if (entries.length === 0) {
		return (
			<div className='flex flex-col items-center gap-2 py-12 text-center'>
				<p className='text-muted-foreground text-sm'>
					{emptyMessage ??
						"No resolved predictions yet. Check back after the next one wraps up."}
				</p>
			</div>
		);
	}

	return (
		<div className='flex flex-col gap-3.5'>
			{entries.map((entry, index) => {
				// A heading whenever the day changes, so cards only carry a time.
				const day = dayOf(entry);
				const showDay = index === 0 || day !== dayOf(entries[index - 1]);
				return (
					<Reveal
						key={entry.prediction_id}
						index={index}
						className='flex flex-col gap-3.5'
					>
						{showDay ? (
							<h3 className='flex items-center gap-2.5 text-xs font-semibold text-muted-foreground after:h-px after:flex-1 after:bg-border'>
								{day}
							</h3>
						) : null}
						<PredictionHistoryCard entry={entry} />
					</Reveal>
				);
			})}
		</div>
	);
}

// "Today", "Yesterday", "Sat, Nov 7": the day a prediction was settled.
function dayOf(entry: PredictionHistoryEntry) {
	const date = new Date(entry.resolved_at ?? entry.created_at);
	const today = new Date();
	const days = Math.round(
		(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
			new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
			86_400_000,
	);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	return date.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
	});
}
