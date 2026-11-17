import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { PredictionNeighbour } from "@/shared/lib/api";
import { usePredictionNeighbours } from "@/features/predictions/hooks/prediction";
import type { Prediction } from "@/features/predictions/types/types";
import { cn } from "@/shared/lib/utils";

const STEP =
	"flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The arrows beside where a prediction sits: the one before and after it in
// its series. Stepping replaces the page in history, so Back still returns
// to wherever the reader came from.
export function PredictionStepper({
	prediction,
	roomId,
	roomCode,
}: Readonly<{ prediction: Prediction; roomId: string; roomCode: string }>) {
	const { data } = usePredictionNeighbours(roomId, prediction);
	if (!data || (!data.previous && !data.next)) return null;

	return (
		<nav aria-label='More questions' className='-my-1.5 flex items-center'>
			<Step to={data.previous} roomCode={roomCode} direction='previous' />
			<Step to={data.next} roomCode={roomCode} direction='next' />
		</nav>
	);
}

function Step({
	to,
	roomCode,
	direction,
}: Readonly<{ to: PredictionNeighbour | null; roomCode: string; direction: "previous" | "next" }>) {
	const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon;
	const word = direction === "previous" ? "Previous" : "Next";

	if (!to) {
		return (
			<span className={cn(STEP, "opacity-35")} aria-hidden>
				<Icon className='size-5' />
			</span>
		);
	}

	const number = to.series_prediction_number ? `No. ${to.series_prediction_number}: ` : "";
	return (
		<Link
			to={`/rooms/${roomCode}/predictions/${to.id}`}
			replace
			title={`${number}${to.title}`}
			aria-label={`${word} question: ${number}${to.title}`}
			className={cn(STEP, "hover:bg-secondary hover:text-foreground")}
		>
			<Icon className='size-5' />
		</Link>
	);
}
