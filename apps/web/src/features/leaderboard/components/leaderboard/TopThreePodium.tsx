import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { Reveal, Skeleton } from "@/shared/ui";

// What each podium spot shows; callers decide (series balance or overall profit).
export type PodiumEntry = {
	player_id: string;
	username: string;
	rank: number;
	primary: string;
	secondary: string;
};

type Props = {
	top: PodiumEntry[];
	currentPlayerId: string;
	isLoading?: boolean;
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

const podiumOrder = [1, 0, 2]; // visually: 2nd | 1st | 3rd

const PODIUM_SHELL = "flex items-end justify-center gap-2 pt-4 pb-2";

function slotClassName(isFirst: boolean) {
	return cn(
		"flex flex-col items-center gap-1 flex-1",
		isFirst && "order-first md:order-0",
	);
}

function stepClassName(rank: number) {
	let podiumClass = "bg-muted/30 min-h-6";
	if (rank === 1) {
		podiumClass = "bg-rank-1/15 min-h-[3rem]";
	} else if (rank === 2) {
		podiumClass = "bg-muted/50 min-h-8";
	}
	return cn(
		"w-full rounded-t-md flex items-center justify-center",
		podiumClass,
	);
}

// The podium's exact shape (medal, avatar, three text lines, the step) with
// placeholders, so the standings below don't move when names arrive.
function TopThreePodiumSkeleton() {
	return (
		<div aria-hidden='true' className={PODIUM_SHELL}>
			{podiumOrder.map((index) => {
				const rank = index + 1;
				const isFirst = rank === 1;
				return (
					<div key={rank} className={slotClassName(isFirst)}>
						<Skeleton className='my-0.5 size-6 rounded-full' />
						<Skeleton
							className={cn(
								"rounded-full",
								isFirst ? "size-14" : "size-10",
							)}
						/>
						<Skeleton className='my-px h-4 w-16' />
						<Skeleton className='my-0.5 h-3 w-12' />
						<Skeleton className='my-0.5 h-2.5 w-8' />
						<div className={stepClassName(rank)} />
					</div>
				);
			})}
		</div>
	);
}

export function TopThreePodium({
	top,
	currentPlayerId,
	isLoading = false,
}: Readonly<Props>) {
	if (isLoading) return <TopThreePodiumSkeleton />;
	if (top.length === 0) return null;

	const slots = podiumOrder.map((i) => top[i]).filter(Boolean);

	return (
		<div className={PODIUM_SHELL}>
			{slots.map((entry, index) => {
				const visualRank = entry.rank; // 1, 2, or 3
				const isFirst = visualRank === 1;
				const isSelf = entry.player_id === currentPlayerId;
				const initials = entry.username.slice(0, 2).toUpperCase();

				return (
					<Reveal
						key={entry.player_id}
						index={index}
						className={slotClassName(isFirst)}
					>
						<span className='text-xl'>
							{MEDALS[visualRank - 1]}
						</span>

						<Avatar
							size='lg'
							className={cn(
								"ring-2",
								isFirst
									? "ring-rank-1 size-14"
									: "ring-muted size-10",
								isSelf && "ring-win",
							)}
						>
							<AvatarFallback
								className={cn(
									isFirst
										? "text-base font-semibold"
										: "text-sm",
								)}
							>
								{initials}
							</AvatarFallback>
						</Avatar>

						<p
							className={cn(
								"text-center font-medium leading-tight max-w-24 truncate text-sm",
								isSelf && "text-win",
							)}
						>
							{entry.username}
							{isSelf && (
								<span className='ml-1 text-xs text-muted-foreground'>
									(You)
								</span>
							)}
						</p>

						<p
							className={cn(
								"text-xs tabular-nums",
								isFirst
									? "font-semibold"
									: "text-muted-foreground",
							)}
						>
							{entry.primary}
						</p>
						<p className='text-[10px] text-muted-foreground tabular-nums'>
							{entry.secondary}
						</p>

						<div className={stepClassName(visualRank)}>
							{isFirst && (
								<span className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
									Top crow
								</span>
							)}
						</div>
					</Reveal>
				);
			})}
		</div>
	);
}
