import { CheckIcon } from "lucide-react";
import type { PredictionStatus } from "@/features/predictions/types/types";
import {
	formatPoints,
	optionTone,
	type OptionTally,
} from "@/features/predictions/lib/predictionView";
import { cn } from "@/shared/lib/utils";

type Props = {
	status: PredictionStatus;
	options: OptionTally[];
	winningOptionId: string | null;
	// The option the viewer has a bet on, if any.
	myOptionId: string | null;
	// Open predictions: the option being picked (sheet open), and the handler.
	selectedOptionId?: string | null;
	onPick?: (optionId: string) => void;
};

// Every option with its share of the points. While the prediction is open
// each is a card to tap; afterwards they share one read-only panel, marking
// your pick and the winner.
export function OptionsBoard({
	status,
	options,
	winningOptionId,
	myOptionId,
	selectedOptionId = null,
	onPick,
}: Readonly<Props>) {
	const open = status === "draft" && !!onPick;
	const settled = status === "revealed";
	const voided = status === "no_result" || status === "cancelled";

	// Open: each option its own card, a radio to tap. Afterwards: one panel
	// of rows, read-only.
	return (
		<ul
			className={cn(
				"flex flex-col",
				open ? "gap-2" : "overflow-hidden rounded-xl border bg-card",
			)}
			aria-label='Options'
		>
			{options.map(({ option, index, points, percent }) => {
				const isWinner = settled && option.id === winningOptionId;
				const isMine = option.id === myOptionId;
				const isSelected = open && option.id === (selectedOptionId ?? myOptionId);
				const tone = optionTone(index);
				const barClass = settled
					? isWinner
						? "bg-win"
						: "bg-muted-foreground/60"
					: voided
						? "bg-muted-foreground/60"
						: tone.bar;

				const marker = open ? (
					<span
						className={cn(
							"flex size-5 shrink-0 items-center justify-center rounded-full border-2",
							isSelected
								? "border-primary bg-primary text-primary-foreground"
								: "border-foreground/25",
						)}
						aria-hidden
					>
						{isSelected ? <CheckIcon className='size-3' strokeWidth={3.5} /> : null}
					</span>
				) : isWinner ? (
					<CheckIcon className='size-4 shrink-0 text-win' strokeWidth={3} aria-label='Winner' />
				) : (
					<span
						className={cn(
							"size-2.5 shrink-0 rounded-full",
							settled || voided ? "bg-muted-foreground/60" : tone.dot,
						)}
						aria-hidden
					/>
				);
				// Bar and points line up under the label, past the marker.
				const indent = open ? "ml-7.5" : "ml-5";

				const body = (
					<>
						<span className='flex items-center justify-between gap-3'>
							<span className='flex min-w-0 items-center gap-2.5 text-base font-semibold'>
								{marker}
								<span className='truncate'>{option.label}</span>
								{isWinner ? (
									<span className='shrink-0 rounded-full bg-win/15 px-2 py-px text-[11px] font-semibold text-win'>
										Won
									</span>
								) : null}
								{isMine ? (
									<span
										className={cn(
											"shrink-0 rounded-full px-2 py-px text-[11px] font-semibold",
											open
												? "bg-primary/15 text-primary"
												: "border border-border text-foreground/85",
										)}
									>
										{open ? "Your pick" : "You"}
									</span>
								) : null}
							</span>
							<span className='shrink-0 text-base font-semibold tabular-nums'>
								{percent}%
							</span>
						</span>
						<span className={cn("block h-1.5 overflow-hidden rounded-full bg-secondary", indent)} aria-hidden>
							<span
								className={cn("block h-full rounded-full transition-[width] duration-500", barClass)}
								style={{ width: `${percent}%` }}
							/>
						</span>
						<span className={cn("text-xs text-muted-foreground tabular-nums", indent)}>
							{formatPoints(points)} pts
						</span>
					</>
				);

				if (open) {
					return (
						<li key={option.id}>
							<button
								type='button'
								className={cn(
									"flex w-full flex-col gap-2 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									isSelected && "border-2 border-primary bg-primary/5 px-[13px] py-[11px]",
								)}
								aria-pressed={isSelected}
								onClick={() => onPick?.(option.id)}
							>
								{body}
							</button>
						</li>
					);
				}

				return (
					<li
						key={option.id}
						className={cn(
							"flex flex-col gap-2 border-t px-3.5 py-3 first:border-t-0",
							isWinner && "bg-win/5",
							settled && !isWinner && "opacity-60",
						)}
					>
						{body}
					</li>
				);
			})}
		</ul>
	);
}
