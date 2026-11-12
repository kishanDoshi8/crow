import type { Bet } from "@/features/predictions/types/bet";
import type { Prediction } from "@/features/predictions/types/types";
import { ResultBanner } from "@/features/predictions/components/ResultBanner";
import { previewWinnings } from "@/features/predictions/lib/payoutPreview";
import { formatPoints, type OptionTally } from "@/features/predictions/lib/predictionView";
import type { ResultCardData } from "@/features/share";

type Props = {
	prediction: Prediction;
	bets: Bet[];
	myBet: Bet | null;
	viewerId: string;
	options: OptionTally[];
	roomId: string;
	resultCard: ResultCardData | null;
};

// The viewer's own stake, as the prediction moves on: what could come back
// while it's locked, what they won or lost (with sharing) once revealed, and
// the refund when it's called off. Open predictions show it in the bottom bar.
export function YourCall({
	prediction,
	bets,
	myBet,
	viewerId,
	options,
	roomId,
	resultCard,
}: Readonly<Props>) {
	if (prediction.status === "draft") return null;

	if (prediction.status === "revealed" && resultCard) {
		return (
			<ResultBanner roomId={roomId} predictionId={prediction.id} data={resultCard} />
		);
	}

	const label = (optionId: string) =>
		options.find((tally) => tally.option.id === optionId)?.option.label ?? "";

	if (!myBet) {
		return prediction.status === "locked" ? (
			<p className='text-sm text-muted-foreground'>You didn't pick this one.</p>
		) : null;
	}

	if (prediction.status === "locked") {
		const gain = previewWinnings(bets, viewerId, myBet.option_id, myBet.amount);
		return (
			<section aria-label='Your call' className='rounded-2xl bg-secondary px-4 py-3.5'>
				<p className='text-xs text-muted-foreground'>Your call</p>
				<p className='mt-1 flex items-baseline justify-between gap-3'>
					<span className='min-w-0 truncate text-[17px] font-semibold'>{label(myBet.option_id)}</span>
					<span className='shrink-0 font-semibold tabular-nums'>{formatPoints(myBet.amount)} pts</span>
				</p>
				<p className='mt-1 text-xs text-muted-foreground'>
					{gain > 0 ? (
						<>
							If {label(myBet.option_id)} wins:{" "}
							<span className='font-semibold text-win tabular-nums'>≈ +{formatPoints(gain)} pts</span>
						</>
					) : (
						"Nobody picked against you, so this one can only be refunded."
					)}
				</p>
			</section>
		);
	}

	return (
		<section aria-label='Your call' className='rounded-2xl bg-secondary px-4 py-3.5'>
			<p className='text-xs text-muted-foreground'>Your call</p>
			<p className='mt-1 flex items-baseline justify-between gap-3'>
				<span className='text-[17px] font-semibold'>Refunded</span>
				<span className='shrink-0 font-semibold tabular-nums'>{formatPoints(myBet.amount)} pts back</span>
			</p>
			<p className='mt-1 text-xs text-muted-foreground'>
				Nobody wins or loses points on this one.
			</p>
		</section>
	);
}
