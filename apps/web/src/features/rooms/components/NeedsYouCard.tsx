import { useRoomContext } from "@/shared/lib/roomContext";
import { useManageQueue } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import type { ManageQueue } from "@/features/rooms/types/types";
import { describeDeadline } from "@/shared/lib/deadline";
import { Button, Collapse } from "@/shared/ui";
import { ChevronRightIcon, LayersIcon, ListChecksIcon } from "lucide-react";
import { Link } from "react-router-dom";

// Staff shortcut to the Manage page. When results are due or people are
// waiting to be let in, it says how many. Owners and organizers always see
// it, with a quick way to add a set of predictions; resolvers only when
// something is due.
export function NeedsYouCard() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data: queue } = useManageQueue(room.id, can.resolve);

	const toResolve = queue?.to_resolve.length ?? 0;
	const joinRequests = queue?.join_requests?.length ?? 0;
	const isDue = toResolve + joinRequests > 0;
	// Wait for the queue, so the quiet card doesn't flash before a due one.
	const isVisible = can.resolve && queue !== undefined && (isDue || can.organize);

	// Arrives after the dashboard has drawn, so slide it in rather than push
	// everything below down in one jump.
	return (
		<Collapse open={isVisible}>
			{isVisible ? (
				isDue ? (
					<NeedsYouLink roomCode={room.code} queue={queue} />
				) : (
					<ManageShortcut roomCode={room.code} queue={queue} />
				)
			) : null}
		</Collapse>
	);
}

function NeedsYouLink({
	roomCode,
	queue,
}: Readonly<{ roomCode: string; queue: ManageQueue }>) {
	const toResolve = queue.to_resolve;
	const requests = queue.join_requests ?? [];
	const count = toResolve.length > 0 ? toResolve.length : requests.length;
	const label =
		toResolve.length > 0
			? `${count === 1 ? "result" : "results"} to reveal`
			: `${count === 1 ? "join request" : "join requests"}`;
	const detail =
		toResolve.length > 0
			? `Oldest locked ${describeDeadline(new Date(toResolve[0].deadline)).relative}`
			: requests.length === 1
				? `${requests[0].username} wants to join`
				: `${requests[0].username} and ${requests.length - 1} more want to join`;

	return (
		<Link
			to={`/rooms/${roomCode}/manage`}
			aria-label={`Needs you: ${count} ${label}`}
			className='mt-3 w-full max-w-md mx-auto flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
		>
			<span className='min-w-7 text-center text-3xl font-bold leading-none text-primary tabular-nums'>
				{count}
			</span>
			<span className='min-w-0 flex-1'>
				<span className='block text-sm font-semibold'>{label}</span>
				<span className='block truncate text-xs text-muted-foreground'>{detail}</span>
			</span>
			<span className='flex items-center gap-1 text-xs font-medium text-primary'>
				Review
				<ChevronRightIcon className='size-4' />
			</span>
		</Link>
	);
}

// Nothing due: the way into Manage, and the quickest way to add predictions.
function ManageShortcut({
	roomCode,
	queue,
}: Readonly<{ roomCode: string; queue: ManageQueue }>) {
	const open = queue.open.length;

	return (
		<div className='mt-3 w-full max-w-md mx-auto flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 pr-2'>
			<Link
				to={`/rooms/${roomCode}/manage`}
				aria-label={`Manage: ${open} open ${open === 1 ? "prediction" : "predictions"}`}
				className='flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			>
				<span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
					<ListChecksIcon className='size-4.5' aria-hidden='true' />
				</span>
				<span className='min-w-0 flex-1'>
					<span className='block text-sm font-semibold'>Manage</span>
					<span className='block truncate text-xs text-muted-foreground'>
						{open === 0
							? "Nothing open for picks"
							: `${open} open for picks`}
					</span>
				</span>
				<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
			</Link>
			<Button asChild variant='outline' size='sm' className='shrink-0'>
				<Link to={`/rooms/${roomCode}/predictions/new/set`}>
					<LayersIcon aria-hidden='true' />
					New set
				</Link>
			</Button>
		</div>
	);
}
