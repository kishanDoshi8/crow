import type { Room } from "@/features/rooms/types/types";
import { Badge, Reveal, Skeleton, SkeletonList } from "@/shared/ui";
import { ChevronRightIcon, UsersIcon, ZapIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppNavigation } from "@/shared/lib/navigation";

const ROOM_CARD_SHELL =
	"w-full flex justify-between items-center p-4 rounded-lg bg-card";

// A room card's two lines (name, then code + counts) and chevron.
function RoomCardSkeleton() {
	return (
		<div className={ROOM_CARD_SHELL}>
			<div className='flex flex-col'>
				<div className='flex h-7 items-center'>
					<Skeleton className='h-5 w-36' />
				</div>
				<div className='flex h-5.5 items-center gap-4'>
					<Skeleton className='h-5.5 w-16' />
					<Skeleton className='h-3.5 w-8' />
				</div>
			</div>
			<Skeleton className='size-6 rounded-full' />
		</div>
	);
}

type Props = {
	rooms?: Room[];
	isLoading?: boolean;
	error?: Error | null;
	emptyMessage?: string;
	onRoomSelect?: (room: Room) => void;
};

export function RoomCardsList({
	rooms,
	isLoading = false,
	error = null,
	emptyMessage = "You have not joined any rooms yet.",
	onRoomSelect,
}: Readonly<Props>) {
	const { switchRoom } = useAppNavigation();

	if (isLoading) {
		return (
			<SkeletonList
				count={2}
				className='flex flex-col gap-2'
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
		<div className={`flex flex-col gap-4 items-center`}>
			<div className={`flex flex-col gap-2 w-full`}>
				{rooms.map((room, index) => (
					<Reveal key={room.id} index={index}>
						<Link
							to={`/rooms/${room.code}`}
							onClick={(event) => {
								// Rooms are top-level: the new room replaces history.
								event.preventDefault();
								onRoomSelect?.(room);
								switchRoom(room.code);
							}}
							className={`${ROOM_CARD_SHELL} cursor-pointer hover:border-primary/50`}
						>
							<div className={`flex flex-col`}>
								<span className='text-lg font-semibold'>
									{room.name}
								</span>
								<div className={`flex items-center gap-4`}>
									<Badge
										variant={"secondary"}
										className={`rounded-md text-muted-foreground`}
									>
										{room.code}
									</Badge>
									<div
										className={`flex items-center gap-0.5 text-sm text-muted-foreground`}
									>
										<UsersIcon
											className={`w-3 h-3 text-muted-foreground`}
										/>
										<span
											className={`text-sm text-muted-foreground`}
										></span>
										{room.member_count ?? room.members.length}
									</div>
									{room.active_prediction_count != undefined &&
										room.active_prediction_count > 0 && (
											<div
												className={`flex items-center gap-1 text-sm text-primary`}
											>
												<ZapIcon className={`w-3 h-3`} />
												<span className={`text-sm`}>
													{room.active_prediction_count}
												</span>
												<span>live</span>
											</div>
										)}
								</div>
							</div>
							<ChevronRightIcon
								className={`w-6 h-6 text-muted-foreground`}
							/>
						</Link>
					</Reveal>
				))}
			</div>
		</div>
	);
}
