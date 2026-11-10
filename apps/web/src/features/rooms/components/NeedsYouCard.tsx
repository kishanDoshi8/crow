import { useRoomContext } from "@/shared/lib/roomContext";
import { useManageQueue } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import type { ManageQueueItem } from "@/features/rooms/types/types";
import { describeDeadline } from "@/shared/lib/deadline";
import { Collapse } from "@/shared/ui";
import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";

// For staff only, and only when results are due: how many, and how long the
// oldest has waited. Taps through to the Manage page.
export function NeedsYouCard() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data: queue } = useManageQueue(room.id, can.resolve);

	const toResolve = queue?.to_resolve ?? [];
	const isVisible = can.resolve && toResolve.length > 0;

	// Arrives after the dashboard has drawn, so slide it in rather than push
	// everything below down in one jump.
	return (
		<Collapse open={isVisible}>
			{isVisible ? (
				<NeedsYouLink roomCode={room.code} toResolve={toResolve} />
			) : null}
		</Collapse>
	);
}

function NeedsYouLink({
	roomCode,
	toResolve,
}: Readonly<{ roomCode: string; toResolve: ManageQueueItem[] }>) {
	const oldest = describeDeadline(new Date(toResolve[0].deadline));
	const count = toResolve.length;

	return (
		<Link
			to={`/rooms/${roomCode}/manage`}
			aria-label={`Needs you: ${count} ${count === 1 ? "result" : "results"} to reveal`}
			className='mt-3 w-full max-w-md mx-auto flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
		>
			<span className='min-w-7 text-center text-3xl font-bold leading-none text-primary tabular-nums'>
				{count}
			</span>
			<span className='min-w-0 flex-1'>
				<span className='block text-sm font-semibold'>
					{count === 1 ? "result" : "results"} to reveal
				</span>
				<span className='block text-xs text-muted-foreground'>
					Oldest locked {oldest.relative}
				</span>
			</span>
			<span className='flex items-center gap-1 text-xs font-medium text-primary'>
				Review
				<ChevronRightIcon className='size-4' />
			</span>
		</Link>
	);
}
