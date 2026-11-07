import { useRoomContext } from "@/shared/lib/roomContext";
import { roomPlayerName } from "@/features/rooms";
import type { Prediction } from "@/features/predictions/types/types";
import { cn } from "@/shared/lib/utils";

const VERB: Partial<Record<Prediction["status"], string>> = {
	revealed: "Revealed by",
	no_result: "Marked no result by",
	cancelled: "Cancelled by",
};

// "Revealed by Raj": who closed the prediction, so results stay accountable
// when several people run the room. A fixed result also says who corrected it.
export function ResolvedByLine({
	prediction,
	className,
}: Readonly<{
	prediction: Pick<Prediction, "status" | "resolved_by" | "corrected_by">;
	className?: string;
}>) {
	const { room } = useRoomContext();
	// After a correction the first closer's verb may no longer fit the result.
	const verb = prediction.corrected_by ? "Closed by" : VERB[prediction.status];
	const nameOf = (playerId?: string | null) => roomPlayerName(room, playerId);
	const name = nameOf(prediction.resolved_by);
	const correctedBy = prediction.corrected_by
		? (nameOf(prediction.corrected_by) ?? "an organizer")
		: null;

	if (!verb || (!name && !correctedBy)) {
		return null;
	}

	return (
		<p className={cn("text-xs text-muted-foreground", className)}>
			{name ? (
				<>
					{verb} <span className='font-medium text-foreground'>{name}</span>
				</>
			) : null}
			{name && correctedBy ? " · " : null}
			{correctedBy ? (
				<>
					Corrected by{" "}
					<span className='font-medium text-foreground'>{correctedBy}</span>
				</>
			) : null}
		</p>
	);
}
