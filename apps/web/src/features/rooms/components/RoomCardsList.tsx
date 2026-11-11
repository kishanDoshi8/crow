import type { Room } from "@/features/rooms/types/types";
import { Reveal, Skeleton, SkeletonList, StatStrip } from "@/shared/ui";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Link } from "react-router-dom";
import { useAppNavigation } from "@/shared/lib/navigation";

const ROOM_CARD_SHELL = "flex w-full flex-col gap-3 rounded-2xl border bg-card p-3.5";

// A room card's name line and its strip of facts.
function RoomCardSkeleton() {
	return (
		<div className={ROOM_CARD_SHELL}>
			<div className='flex h-6 items-center justify-between'>
				<Skeleton className='h-4.5 w-36' />
				<Skeleton className='size-4' />
			</div>
			<Skeleton className='h-13 w-full rounded-xl' />
		</div>
	);
}

type Props = {
	rooms?: Room[];
	isLoading?: boolean;
	error?: Error | null;
	emptyMessage?: string;
	onRoomSelect?: (room: Room) => void;
	// Marked "Last opened", so it's easy to find again.
	lastOpenedRoomId?: string | null;
};

export function RoomCardsList({
	rooms,
	isLoading = false,
	error = null,
	emptyMessage = "You have not joined any rooms yet.",
	onRoomSelect,
	lastOpenedRoomId,
}: Readonly<Props>) {
	const { switchRoom } = useAppNavigation();

	if (isLoading) {
		return (
			<SkeletonList
				count={2}
				className='flex flex-col gap-3'
				renderItem={() => <RoomCardSkeleton />}
			/>
		);
	}

	if (error) {
		return (
			<p className={`text-sm text-destructive`}>
				Couldn't load your rooms. Check your connection and try again.
			</p>
		);
	}

	if (!rooms || rooms.length === 0) {
		return <p className={`text-muted-foreground`}>{emptyMessage}</p>;
	}

	return (
		<ul className='flex w-full flex-col gap-3'>
			{rooms.map((room, index) => {
				const isLastOpened = room.id === lastOpenedRoomId;
				const open = room.active_prediction_count ?? 0;
				return (
					<Reveal as='li' key={room.id} index={index}>
						<Link
							to={`/rooms/${room.code}`}
							onClick={(event) => {
								// Rooms are top-level: the new room replaces history.
								event.preventDefault();
								onRoomSelect?.(room);
								switchRoom(room.code);
							}}
							className={cn(
								ROOM_CARD_SHELL,
								"transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
								isLastOpened && "border-primary/40",
							)}
						>
							<span className='flex items-center justify-between gap-3'>
								<span className='truncate text-lg font-semibold leading-snug'>
									{room.name}
								</span>
								{isLastOpened ? (
									<span className='shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground'>
										Last opened
									</span>
								) : (
									<ChevronRightIcon
										className='size-4 shrink-0 text-muted-foreground'
										aria-hidden='true'
									/>
								)}
							</span>
							<StatStrip
								stats={[
									{ label: "Members", value: room.member_count ?? room.members.length },
									{
										label: "Open now",
										value: open,
										tone: open > 0 ? "text-primary" : "text-muted-foreground",
									},
									{
										label: "Code",
										value: <span className='tracking-wider'>{room.code}</span>,
										grow: 1.2,
									},
								]}
							/>
						</Link>
					</Reveal>
				);
			})}
		</ul>
	);
}
