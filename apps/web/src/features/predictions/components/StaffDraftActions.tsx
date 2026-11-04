import { useRoomContext } from "@/shared/lib/roomContext";
import {
	CloseWithoutResultDialog,
} from "@/features/predictions/components/ResolvePredictionDrawer";
import { useRoomRole } from "@/features/rooms";
import { Button } from "@/shared/ui";
import { BanIcon, PencilIcon } from "lucide-react";
import { Link } from "react-router-dom";

// Staff tools on a prediction that's still open for picks: organizers edit
// it, anyone who can close predictions can cancel it.
export function StaffDraftActions({
	predictionId,
}: Readonly<{ predictionId: string }>) {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);

	if (!can.resolve) {
		return null;
	}

	return (
		<div className='flex w-full max-w-md mx-auto items-center justify-end gap-2'>
			{can.organize ? (
				<Button variant='ghost' size='sm' asChild>
					<Link
						to={`/rooms/${room.code}/predictions/${predictionId}/edit`}
					>
						<PencilIcon />
						Edit
					</Link>
				</Button>
			) : null}
			<CloseWithoutResultDialog
				mode='cancel'
				predictionId={predictionId}
				roomId={room.id}
			>
				<Button variant='ghost' size='sm' className='text-destructive'>
					<BanIcon />
					Cancel prediction
				</Button>
			</CloseWithoutResultDialog>
		</div>
	);
}
