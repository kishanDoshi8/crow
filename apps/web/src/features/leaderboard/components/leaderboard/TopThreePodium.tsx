import type { ReactNode } from "react";
import { cn, ordinal } from "@/shared/lib/utils";
import { Reveal, Skeleton } from "@/shared/ui";

// What each podium spot shows; callers decide (series balance or overall profit).
export type PodiumEntry = {
	player_id: string;
	username: string;
	rank: number;
	// Under the name: the number the table ranks by.
	primary: string;
	// On the step: what goes with it (profit, titles).
	secondary: ReactNode;
};

type Props = {
	top: PodiumEntry[];
	currentPlayerId: string;
	isLoading?: boolean;
};

const podiumOrder = [1, 0, 2]; // visually: 2nd | 1st | 3rd
const PODIUM_SHELL = "grid grid-cols-3 items-end gap-2 pt-2";

// Each place's step: the winner's is tallest and gold.
const STEPS: Record<number, { height: string; step: string; place: string; avatar: string }> = {
	1: {
		height: "h-28",
		step: "border-rank-1/40 bg-rank-1/15",
		place: "text-3xl text-rank-1",
		avatar: "size-15 text-lg ring-rank-1",
	},
	2: {
		height: "h-19",
		step: "border-border bg-muted/70",
		place: "text-[1.375rem] text-foreground",
		avatar: "size-11 text-sm ring-border",
	},
	3: {
		height: "h-14",
		step: "border-border bg-muted/40",
		place: "text-lg text-muted-foreground",
		avatar: "size-11 text-sm ring-border",
	},
};

function TopThreePodiumSkeleton() {
	return (
		<div aria-hidden='true' className={PODIUM_SHELL}>
			{podiumOrder.map((index) => {
				const rank = index + 1;
				return (
					<div key={rank} className='flex flex-col items-center gap-1.5'>
						<Skeleton className={cn("rounded-full", rank === 1 ? "size-15" : "size-11")} />
						<Skeleton className='h-4 w-16' />
						<Skeleton className='h-3 w-10' />
						<div className={cn("w-full rounded-t-xl bg-muted/40", STEPS[rank].height)} />
					</div>
				);
			})}
		</div>
	);
}

// The top three on their steps, the place written on each. It sits on top
// of the standings table, which lists everyone (these three included).
export function TopThreePodium({
	top,
	currentPlayerId,
	isLoading = false,
}: Readonly<Props>) {
	if (isLoading) return <TopThreePodiumSkeleton />;
	if (top.length === 0) return null;

	return (
		<ol aria-label='Top three' className={PODIUM_SHELL}>
			{podiumOrder.map((slot, index) => {
				const entry = top[slot];
				// Fewer than three ranked: keep the gap so first stays in the middle.
				if (!entry) return <li key={slot} aria-hidden='true' />;
				const style = STEPS[entry.rank] ?? STEPS[3];
				const isSelf = entry.player_id === currentPlayerId;
				const isFirst = entry.rank === 1;

				return (
					<Reveal
						as='li'
						key={entry.player_id}
						index={index}
						className='flex min-w-0 flex-col items-center gap-1.5'
					>
						<span
							aria-hidden='true'
							className={cn(
								"flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold ring-2 ring-offset-2 ring-offset-background",
								style.avatar,
								isSelf && "ring-primary",
							)}
						>
							{entry.username.slice(0, 2).toUpperCase()}
						</span>
						<span className='flex w-full min-w-0 flex-col items-center'>
							<span
								className={cn(
									"max-w-full truncate",
									isFirst ? "text-base font-bold" : "text-sm font-semibold",
								)}
							>
								{entry.username}
							</span>
							<span
								className={cn(
									"text-xs tabular-nums",
									isFirst ? "font-semibold" : "text-muted-foreground",
								)}
							>
								{entry.primary}
							</span>
						</span>
						<span
							className={cn(
								"flex w-full flex-col items-center gap-0.5 rounded-t-xl border border-b-0 pt-2.5",
								style.height,
								isSelf && !isFirst ? "border-primary/35 bg-primary/10" : style.step,
							)}
						>
							<span className={cn("font-bold leading-none", style.place)}>
								{ordinal(entry.rank)}
							</span>
							<span className='text-xs font-semibold tabular-nums'>{entry.secondary}</span>
							{isFirst ? (
								<span className='mt-auto pb-2 text-xs font-semibold text-rank-1'>
									Top crow
								</span>
							) : null}
						</span>
					</Reveal>
				);
			})}
		</ol>
	);
}
