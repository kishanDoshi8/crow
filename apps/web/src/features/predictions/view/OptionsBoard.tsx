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

// Every option with its share of the points. While the prediction is open the
// rows are the way to pick; afterwards they're read-only, marking your pick
// and the winner.
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

	return (
		<ul className='flex flex-col gap-2' aria-label='Options'>
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

				const body = (
					<>
						<span className='flex items-center justify-between gap-3'>
							<span className='flex min-w-0 items-center gap-2 text-base font-semibold'>
								{isWinner ? (
									<CheckIcon className='size-4 shrink-0 text-win' strokeWidth={3} aria-label='Winner' />
								) : (
									<span
										className={cn(
											"size-2.5 shrink-0 rounded-full",
											settled || voided ? "bg-muted-foreground/60" : tone.dot,
										)}
										aria-hidden
									/>
								)}
								<span className='truncate'>{option.label}</span>
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
						<span className='block h-1.5 overflow-hidden rounded-full bg-secondary' aria-hidden>
							<span
								className={cn("block h-full rounded-full transition-[width] duration-500", barClass)}
								style={{ width: `${percent}%` }}
							/>
						</span>
						<span className='text-xs text-muted-foreground tabular-nums'>
							{formatPoints(points)} pts
						</span>
					</>
				);

				const shell = cn(
					"flex w-full flex-col gap-2 rounded-xl border px-3.5 py-3 text-left",
					isSelected && "border-2 border-primary px-[13px] py-[11px]",
					isWinner && "border-win/55 bg-win/5",
					settled && !isWinner && "opacity-70",
				);

				return (
					<li key={option.id}>
						{open ? (
							<button
								type='button'
								className={cn(shell, "bg-card transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
								aria-pressed={isSelected}
								onClick={() => onPick?.(option.id)}
							>
								{body}
							</button>
						) : (
							<div className={shell}>{body}</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}
