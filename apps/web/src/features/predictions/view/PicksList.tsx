import { EyeOffIcon } from "lucide-react";
import type { Bet } from "@/features/predictions/types/bet";
import type { PredictionStatus } from "@/features/predictions/types/types";
import {
	formatDelta,
	formatPoints,
	initials,
	optionTone,
	type OptionTally,
} from "@/features/predictions/lib/predictionView";
import { cn } from "@/shared/lib/utils";

type Props = {
	status: PredictionStatus;
	bets: Bet[];
	options: OptionTally[];
	winningOptionId: string | null;
	viewerId: string | null;
	nameOf: (playerId: string) => string;
	onOpenPlayer: (playerId: string) => void;
};

// Who picked what. Hidden while the prediction is open so nobody copies;
// afterwards one list in every state: name with their pick underneath, and
// on the right the stake, the result, or the refund.
export function PicksList({
	status,
	bets,
	options,
	winningOptionId,
	viewerId,
	nameOf,
	onOpenPlayer,
}: Readonly<Props>) {
	const count = bets.length;
	const heading = (
		<h2 className='mb-2.5 flex items-baseline justify-between gap-3 text-sm font-semibold'>
			{status === "revealed" ? "Payouts" : "Picks"}
			<span className='text-xs font-normal text-muted-foreground'>
				{status === "no_result" || status === "cancelled"
					? "All refunded"
					: `${count} ${count === 1 ? "pick" : "picks"}`}
			</span>
		</h2>
	);

	if (status === "draft") {
		return (
			<section>
				{heading}
				<p className='flex items-start gap-2.5 rounded-xl border border-dashed border-foreground/15 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground'>
					<EyeOffIcon className='mt-px size-4 shrink-0' aria-hidden />
					{count === 0
						? "No picks yet."
						: "Who picked what shows when picks close, so nobody copies."}
				</p>
			</section>
		);
	}

	if (count === 0) {
		return (
			<section>
				{heading}
				<p className='text-xs text-muted-foreground'>Nobody picked this one.</p>
			</section>
		);
	}

	const optionById = new Map(options.map((tally) => [tally.option.id, tally]));
	const settled = status === "revealed";
	const voided = status === "no_result" || status === "cancelled";
	const resultOf = (bet: Bet) => (bet.payout ?? bet.amount) - bet.amount;
	const rows = [...bets].sort((a, b) =>
		settled ? resultOf(b) - resultOf(a) : b.amount - a.amount,
	);

	return (
		<section>
			{heading}
			<ul className='overflow-hidden rounded-xl border bg-card'>
				{rows.map((bet) => {
					const tally = optionById.get(bet.option_id);
					const isMe = bet.player_id === viewerId;
					const won = settled && bet.option_id === winningOptionId;
					const delta = resultOf(bet);
					const dotClass =
						settled
							? won
								? "bg-win"
								: "bg-muted-foreground/60"
							: voided
								? "bg-muted-foreground/60"
								: optionTone(tally?.index ?? 0).dot;
					const name = nameOf(bet.player_id);

					return (
						<li key={bet.id} className='border-t first:border-t-0'>
							<button
								type='button'
								onClick={() => onOpenPlayer(bet.player_id)}
								className={cn(
									"flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
									isMe && "bg-secondary/40",
								)}
							>
								<span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold'>
									{initials(name)}
								</span>
								<span className='flex min-w-0 flex-1 flex-col leading-tight'>
									<span className='truncate text-sm'>
										{name}
										{isMe ? <span className='text-xs text-muted-foreground'> (you)</span> : null}
									</span>
									<span className='mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground'>
										<span className={cn("size-2 shrink-0 rounded-full", dotClass)} aria-hidden />
										<span className='truncate'>
											{tally?.option.label ?? "Unknown"}
											{settled ? `, ${formatPoints(bet.amount)} staked` : ""}
										</span>
									</span>
								</span>
								<span
									className={cn(
										"shrink-0 text-right text-sm tabular-nums",
										settled && delta > 0 && "font-semibold text-win",
										settled && delta < 0 && "font-semibold text-loss",
										!settled && "text-foreground/85",
										voided && "text-xs text-muted-foreground",
									)}
								>
									{settled
										? formatDelta(delta)
										: voided
											? `${formatPoints(bet.amount)} back`
											: `${formatPoints(bet.amount)} pts`}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
