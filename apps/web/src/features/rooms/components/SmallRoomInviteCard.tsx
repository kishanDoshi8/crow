import { useRoomContext } from "@/shared/lib/roomContext";
import { useRoomActions } from "@/shared/lib/roomActions";
import { Button } from "@/shared/ui";
import { UsersIcon } from "lucide-react";

const SMALL_ROOM_SIZE = 3;

// A room needs a few people before predictions get interesting.
export function SmallRoomInviteCard() {
	const { room } = useRoomContext();
	const { openInvite } = useRoomActions();
	const memberCount = room.member_count ?? room.members.length;

	if (memberCount >= SMALL_ROOM_SIZE) return null;

	return (
		<div className='mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3'>
			<div className='flex size-9 shrink-0 items-center justify-center rounded-full bg-muted'>
				<UsersIcon className='size-4 text-muted-foreground' />
			</div>
			<p className='min-w-0 flex-1 text-sm text-muted-foreground'>
				{memberCount === 1
					? "It's just you so far. Predictions are better with friends."
					: "Two's a start. Bring a few more friends in."}
			</p>
			<Button size='sm' variant='outline' onClick={openInvite}>
				Invite
			</Button>
		</div>
	);
}
