import type { PredictionHistoryEntry } from "@/features/leaderboard/types/types";
import { Badge } from "@/shared/ui/badge";
import { Skeleton, SkeletonList } from "@/shared/ui/skeleton";
import { cn, formatSignedPoints } from "@/shared/lib/utils";
import {
	CheckCircle2,
	XCircle,
	MinusCircle,
	CrownIcon,
	TrendingUpIcon,
} from "lucide-react";
import Dot from "@/shared/ui/dot";
import { Link } from "react-router-dom";
import { Reveal } from "@/shared/ui";
import { useRoomContext } from "@/shared/lib/roomContext";
import { ReactionSummary } from "@/features/talk";

const CARD_SHELL = "border-2 rounded-xl p-3 flex flex-col gap-2";

// ─── PredictionHistoryCard ────────────────────────────────────────────────────

function statusMeta(status: PredictionHistoryEntry["status"]) {
	switch (status) {
		case "revealed":
			return {
				icon: <CheckCircle2 className='size-4 text-win' />,
				label: "Resolved",
			};
		case "cancelled":
			return {
				icon: <XCircle className='size-4 text-destructive' />,
				label: "Cancelled",
			};
		case "no_result":
			return {
				icon: <MinusCircle className='size-4 text-muted-foreground' />,
				label: "No result",
			};
	}
}

type CardProps = {
	entry: PredictionHistoryEntry;
};

// The viewer's own outcome on a finished prediction.
function myResult(entry: PredictionHistoryEntry) {
	if (entry.my_bet_amount === null) return null;
	if (entry.status !== "revealed") {
		return { label: "Refunded", tone: "text-muted-foreground bg-muted" };
	}
	const net = (entry.my_payout ?? 0) - entry.my_bet_amount;
	if (net > 0)
		return { label: formatSignedPoints(net), tone: "text-win bg-win/15" };
	if (net < 0)
		return { label: formatSignedPoints(net), tone: "text-loss bg-loss/15" };
	return { label: "±0", tone: "text-muted-foreground bg-muted" };
}

// const RESOLVED_BY_VERB: Record<PredictionHistoryEntry["status"], string> = {
// 	revealed: "Revealed",
// 	no_result: "Marked no result",
// 	cancelled: "Cancelled",
// };

function PredictionHistoryCard({ entry }: Readonly<CardProps>) {
	const { room } = useRoomContext();
	const meta = statusMeta(entry.status);
	const total =
		entry.options?.reduce((s, o) => s + o.total_bet, 0) ?? entry.total_pool;
	const winner = entry.options?.find((o) => o.id === entry.winning_option_id);
	const participants = entry.participant_count ?? entry.total_bets;

	const winPct =
		participants > 0
			? Math.round((entry.winner_count / participants) * 100)
			: null;

	const resolvedLabel = entry.resolved_at
		? new Date(entry.resolved_at).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			})
		: null;

	let payoutSummary: JSX.Element | string;
	if (entry.status !== "revealed") {
		payoutSummary = entry.no_result_reason ?? "No payout distributed.";
	} else if (entry.winner_count === 0) {
		payoutSummary = "Nobody guessed correctly 💀";
	} else {
		const winnerLabel = entry.winner_count === 1 ? "winner" : "winners";
		payoutSummary = (
			<span className={`text-muted-foreground`}>
				<TrendingUpIcon
					className={`w-3 h-3 inline-block mr-2 text-win`}
				/>
				<span className={`text-sm text-foreground font-semibold`}>
					+{entry.total_paid_to_winners.toLocaleString()} pts
				</span>{" "}
				to {entry.winner_count} {winnerLabel}
			</span>
		);
	}

	const result = myResult(entry);
	const seriesLabel = [
		entry.series_prediction_number
			? `#${entry.series_prediction_number}`
			: null,
		entry.series_title,
	]
		.filter(Boolean)
		.join(" · ");

	const isUpset = entry.status === "revealed" && (winPct ?? 100) <= 25;
	const isSweep = entry.status === "revealed" && (winPct ?? 0) >= 80;

	const isWin =
		entry.selected_option_id === entry.winning_option_id &&
		entry.status === "revealed";
	const isLoss =
		entry.selected_option_id !== null &&
		!isWin &&
		entry.status === "revealed";

	let borderClass = "border-muted/30";
	if (isWin) {
		borderClass = "border-win/30";
	} else if (isLoss) {
		borderClass = "border-loss/30";
	}

	return (
		<Link
			to={`/rooms/${room.code}/predictions/${entry.prediction_id}`}
			className={cn(
				CARD_SHELL,
				"hover:bg-secondary/50 transition-colors",
				borderClass,
			)}
		>
			{/* Header: where it sits in its series, and how it went for you */}
			<div className={`space-y-1`}>
				<div className='flex items-center gap-2'>
					<div className='shrink-0' title={meta.label}>
						{meta.icon}
					</div>
					<div className='flex-1 min-w-0'>
						{seriesLabel ? (
							<p className='text-xs text-muted-foreground truncate'>
								{seriesLabel}
							</p>
						) : null}
					</div>
					{result ? (
						<span
							className={cn(
								"shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
								result.tone,
							)}
							aria-label={`Your result: ${result.label}`}
						>
							{result.label}
						</span>
					) : null}
				</div>
				<p className='text-sm font-medium leading-snug'>
					{entry.title}
				</p>
			</div>

			{/* Winner pill */}
			{winner && (
				<div className='flex items-center gap-1.5 flex-wrap'>
					<span className='text-xs text-muted-foreground'>
						Winner:
					</span>
					<Badge className='text-xs bg-win/20 text-win font-semibold'>
						<CrownIcon />
						{winner.label}
					</Badge>
					{entry.selected_option_label && (
						<>
							<Dot />
							<span className='text-xs text-muted-foreground'>
								Your pick:
							</span>
							<span
								className={`text-xs font-semibold ${entry.selected_option_id === entry.winning_option_id ? "text-win" : "text-loss"}`}
							>
								{entry.selected_option_label}
							</span>
						</>
					)}
					{isUpset && (
						<Badge variant='secondary' className='text-xs'>
							Upset ⚡
						</Badge>
					)}
					{isSweep && (
						<Badge variant='secondary' className='text-xs'>
							Sweep 🧹
						</Badge>
					)}
				</div>
			)}

			{/* Option bars */}
			{entry.options && total > 0 && (
				<div className='flex flex-col gap-1 my-1'>
					{entry.options.map((opt) => {
						const pct =
							total > 0
								? Math.round((opt.total_bet / total) * 100)
								: 0;
						const isWinner = opt.id === entry.winning_option_id;
						return (
							<div
								key={opt.id}
								className='flex items-center gap-2'
							>
								<p className={`text-xs w-13 truncate`}>
									{opt.label}
								</p>
								<div className='flex-1 h-2 rounded-full bg-muted overflow-hidden'>
									<div
										className={cn(
											"h-full rounded-full transition-all",
											isWinner
												? "bg-win"
												: "bg-muted-foreground/40",
										)}
										style={{ width: `${pct}%` }}
									/>
								</div>
								<span
									className={cn(
										"text-xs tabular-nums w-8 text-right",
										isWinner
											? "text-win font-medium"
											: "text-muted-foreground",
									)}
								>
									{pct}%
								</span>
							</div>
						);
					})}
				</div>
			)}

			{/* Footer meta */}
			<div className='grid grid-cols-[1fr_auto] px-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground'>
				{total > 0 && <span>Pool: {total.toLocaleString()} pts</span>}
				{resolvedLabel && <span>{resolvedLabel}</span>}
			</div>

			<div className='flex flex-wrap items-center gap-x-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs'>
				<div className='font-medium text-foreground'>
					{payoutSummary}
				</div>
				{entry.status === "revealed" && entry.biggest_payout > 0 && (
					<span className='text-muted-foreground'>
						· top{" "}
						<span className={`text-win font-semibold`}>
							+{entry.biggest_payout.toLocaleString()}
						</span>
					</span>
				)}
			</div>

			<ReactionSummary
				topReactions={entry.top_reactions}
				myReaction={entry.my_reaction}
				postCount={entry.post_count}
				className='px-1'
			/>
		</Link>
	);
}

// A resolved card's sections (header, winner, option bars, meta, payout) at
// their real line heights, so the feed doesn't grow when entries arrive.
function PredictionHistoryCardSkeleton() {
	return (
		<div className={cn(CARD_SHELL, "border-muted/30")}>
			<div className='space-y-1'>
				<div className='flex h-5 items-center gap-2'>
					<Skeleton className='size-4 rounded-full' />
					<Skeleton className='h-3 w-28' />
					<Skeleton className='ml-auto h-5 w-12' />
				</div>
				<div className='flex h-5 items-center'>
					<Skeleton className='h-3.5 w-3/4' />
				</div>
			</div>
			<div className='flex h-5.5 items-center gap-1.5'>
				<Skeleton className='h-3 w-12' />
				<Skeleton className='h-5.5 w-20 rounded-full' />
			</div>
			<div className='my-1 flex flex-col gap-1'>
				{[0, 1].map((option) => (
					<div key={option} className='flex h-4 items-center gap-2'>
						<Skeleton className='h-3 w-13' />
						<Skeleton className='h-2 flex-1 rounded-full' />
						<Skeleton className='h-3 w-8' />
					</div>
				))}
			</div>
			<div className='grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-2'>
				{["w-24", "w-20", "w-20", "w-24", "w-32"].map((width, line) => (
					<div key={line} className='flex h-4 items-center'>
						<Skeleton className={cn("h-3", width)} />
					</div>
				))}
			</div>
			<Skeleton className='h-7 w-full' />
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
				<p className='text-4xl'>📭</p>
				<p className='text-muted-foreground text-sm'>
					{emptyMessage ??
						"No resolved predictions yet. Check back after the next one wraps up."}
				</p>
			</div>
		);
	}

	return (
		<div className='flex flex-col gap-4'>
			{entries.map((entry, index) => (
				<Reveal
					key={entry.prediction_id}
					index={index}
					className='flex flex-col'
				>
					<PredictionHistoryCard entry={entry} />
				</Reveal>
			))}
		</div>
	);
}
