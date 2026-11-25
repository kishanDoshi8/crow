import { CheckIcon, ChevronRightIcon, PlusIcon, RocketIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { usePickUpNext, useUpNext } from "@/features/series/hooks/suggestions";
import type { UpNextOption } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { Button, Skeleton } from "@/shared/ui";
import { SomethingElseSheet } from "./SomethingElseSheet";
import { StartSeriesSheet } from "./StartSeriesSheet";

type Props = {
	roomId: string;
	roomCode: string;
	// "prompt": the question itself, at the top of Home when no series is
	// running. "compact": a few options at the bottom while one runs.
	variant: "prompt" | "compact" | "page";
	isHost: boolean;
};

// "What should we predict next?" asked like one of the room's own questions:
// tap an option to make it your pick (tap again to take it back), and see the
// split. Hosts start the next series from the favourite.
export function UpNextBallot({ roomId, roomCode, variant, isHost }: Readonly<Props>) {
	const { data: board, isPending } = useUpNext(roomId);
	const { mutate: pick, isPending: isPicking } = usePickUpNext(roomId);
	const [isElseOpen, setIsElseOpen] = useState(false);
	const [starting, setStarting] = useState<UpNextOption | null>(null);

	const compact = variant === "compact";
	const options = board?.options ?? [];
	const shown = compact ? options.slice(0, 3) : options;
	const total = board?.total_picks ?? 0;
	const favourite = options[0]?.id && options[0].picks > 0 ? options[0] : null;
	const onPick = (option: UpNextOption) =>
		pick(
			option.picked_by_me
				? null
				: option.competition_id
					? { competitionId: option.competition_id }
					: { title: option.title },
			{
				onError: () =>
					toast.error("Couldn't save your pick. Try again.", { position: "top-center" }),
			},
		);

	return (
		<section
			aria-labelledby={`up-next-${variant}`}
			className={cn(
				"flex flex-col gap-3",
				variant === "page" ? "" : "rounded-2xl border bg-card p-4",
			)}
		>
			<div>
				<h2
					id={`up-next-${variant}`}
					className={cn("font-semibold", variant === "prompt" ? "text-lg leading-snug" : "text-base")}
				>
					What should we predict next?
				</h2>
				<p className='text-sm text-muted-foreground'>
					{compact
						? "Your pick for after this series."
						: total === 0
							? "Pick one, and be the first. The hosts start the next series from the room's favourite."
							: "Pick one. The hosts start the next series from the room's favourite."}
				</p>
			</div>

			{isPending ? (
				<div aria-hidden='true' className='flex flex-col gap-2'>
					<Skeleton className='h-[74px] rounded-xl' />
					<Skeleton className='h-[74px] rounded-xl' />
				</div>
			) : (
				<ul className='flex flex-col gap-2' aria-label='Options'>
					{shown.map((option) => (
						<li key={option.id ?? option.competition_id ?? option.title}>
							<OptionButton
								option={option}
								total={total}
								showPickers={isHost && !compact}
								disabled={isPicking}
								onPick={() => onPick(option)}
							/>
						</li>
					))}
				</ul>
			)}

			{compact ? (
				<Link
					to={`/rooms/${roomCode}/series/next`}
					className='flex items-center gap-1.5 self-start text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
				>
					{options.length > shown.length ? `See all ${options.length}` : "See all"}, or suggest one
					<ChevronRightIcon className='size-4' aria-hidden='true' />
				</Link>
			) : (
				<Button variant='ghost' className='self-start' onClick={() => setIsElseOpen(true)}>
					<PlusIcon aria-hidden='true' />
					Something else
				</Button>
			)}

			{/* The favourite, one tap from being the next series. */}
			{isHost && !compact && favourite ? (
				<div className='flex flex-col gap-2 border-t pt-3'>
					<p className='text-sm text-muted-foreground'>
						The room's favourite is <span className='font-semibold text-foreground'>{favourite.title}</span>.
					</p>
					<Button className='self-start' onClick={() => setStarting(favourite)}>
						<RocketIcon aria-hidden='true' />
						Start the next series
					</Button>
				</div>
			) : null}

			{board ? (
				<SomethingElseSheet
					open={isElseOpen}
					onOpenChange={setIsElseOpen}
					catalog={board.catalog}
					onPick={(choice) => {
						setIsElseOpen(false);
						pick(choice, {
							onError: (error) =>
								toast.error(
									error.message.includes("60 characters")
										? "Keep it to 60 characters."
										: "Couldn't save your pick. Try again.",
									{ position: "top-center" },
								),
						});
					}}
				/>
			) : null}
			{starting ? (
				<StartSeriesSheet
					roomId={roomId}
					roomCode={roomCode}
					idea={starting}
					open={!!starting}
					onOpenChange={(open) => (open ? null : setStarting(null))}
				/>
			) : null}
		</section>
	);
}

// One option, laid out like an open question's option: a radio, the name,
// its share of the picks as a bar, and the count under it.
function OptionButton({
	option,
	total,
	showPickers,
	disabled,
	onPick,
}: Readonly<{
	option: UpNextOption;
	total: number;
	showPickers: boolean;
	disabled: boolean;
	onPick: () => void;
}>) {
	// Before anyone picks there's no split to show: no bars, no percentages.
	const hasSplit = total > 0;
	const percent = hasSplit ? Math.round((option.picks / total) * 100) : 0;
	const mine = option.picked_by_me;
	const pickers = showPickers && option.pickers?.length ? `Picked by ${option.pickers.join(", ")}` : null;

	return (
		<button
			type='button'
			aria-pressed={mine}
			disabled={disabled}
			onClick={onPick}
			className={cn(
				"flex w-full flex-col gap-2 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress",
				mine && "border-2 border-primary bg-primary/5 px-[13px] py-[11px]",
			)}
		>
			<span className='flex items-center justify-between gap-3'>
				<span className='flex min-w-0 items-center gap-2.5'>
					<span
						aria-hidden
						className={cn(
							"flex size-5 shrink-0 items-center justify-center rounded-full border-2",
							mine ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25",
						)}
					>
						{mine ? <CheckIcon className='size-3' strokeWidth={3.5} /> : null}
					</span>
					<span className='truncate text-base font-semibold'>{option.title}</span>
				</span>
				{hasSplit ? (
					<span className='shrink-0 text-base font-semibold tabular-nums'>{percent}%</span>
				) : null}
			</span>
			{hasSplit ? (
				<span className='ml-7.5 block h-1.5 overflow-hidden rounded-full bg-secondary' aria-hidden>
					<span
						className={cn(
							"block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
							mine ? "bg-primary" : "bg-muted-foreground/60",
						)}
						style={{ width: `${percent}%` }}
					/>
				</span>
			) : null}
			<span className='ml-7.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
				{mine ? (
					<span className='rounded-full bg-primary/15 px-2 py-px text-[11px] font-semibold text-primary'>
						Your pick
					</span>
				) : null}
				{hasSplit ? (
					<span className='tabular-nums'>
						{option.picks} {option.picks === 1 ? "pick" : "picks"}
					</span>
				) : null}
				{option.on_crow ? (
					option.sport ? <span>{SPORTS[option.sport]}</span> : null
				) : (
					<span>Not on Crow yet</span>
				)}
				{option.followed ? <span>Followed here</span> : null}
			</span>
			{pickers ? <span className='ml-7.5 text-xs text-muted-foreground'>{pickers}</span> : null}
		</button>
	);
}

// The fixtures feature has the same names; it imports this one, so they
// can't be shared without a cycle.
const SPORTS: Record<"soccer" | "cricket", string> = { soccer: "Football", cricket: "Cricket" };
