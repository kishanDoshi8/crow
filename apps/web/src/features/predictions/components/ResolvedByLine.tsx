import { useRoomContext } from "@/shared/lib/roomContext";
import type { Prediction } from "@/features/predictions/types/types";
import { cn } from "@/shared/lib/utils";

const VERB: Partial<Record<Prediction["status"], string>> = {
	revealed: "Revealed by",
	no_result: "Marked no result by",
	cancelled: "Cancelled by",
};

// "Revealed by Raj": who closed the prediction, so results stay accountable
// when several people run the room.
export function ResolvedByLine({
	prediction,
	className,
}: Readonly<{
	prediction: Pick<Prediction, "status" | "resolved_by">;
	className?: string;
}>) {
	const { room } = useRoomContext();
	const verb = VERB[prediction.status];
	const name = room.members.find(
		(member) => member.player_id === prediction.resolved_by,
	)?.player.username;

	if (!verb || !name) {
		return null;
	}

	return (
		<p className={cn("text-xs text-muted-foreground", className)}>
			{verb} <span className='font-medium text-foreground'>{name}</span>
		</p>
	);
}
