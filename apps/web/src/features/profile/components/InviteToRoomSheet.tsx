import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { useInvitableRooms, useInviteToRoom } from "@/features/profile/hooks/profile";
import type { InvitableRoom } from "@/shared/lib/api";
import { initialsOf } from "@/shared/lib/utils";
import {
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Skeleton,
	Spinner,
} from "@/shared/ui";

type Props = {
	playerId: string;
	username: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// Your rooms they aren't in yet, each with an Invite button. They hear
// about it by push and see it at the top of their room list.
export function InviteToRoomSheet({ playerId, username, open, onOpenChange }: Readonly<Props>) {
	const { data: rooms, isPending, error } = useInvitableRooms(playerId, open);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle>Invite {username}</DrawerTitle>
					<DrawerDescription>To one of your rooms they're not in yet.</DrawerDescription>
				</DrawerHeader>
				<div className='max-h-[60vh] overflow-y-auto px-4 pb-6'>
					{isPending ? (
						<div aria-hidden='true' className='flex flex-col gap-2'>
							<Skeleton className='h-14 rounded-xl' />
							<Skeleton className='h-14 rounded-xl' />
						</div>
					) : error ? (
						<p className='text-sm text-muted-foreground'>Couldn't load your rooms. Try again.</p>
					) : rooms.length === 0 ? (
						<p className='rounded-xl border border-dashed border-border/80 px-4 py-5 text-center text-sm text-muted-foreground'>
							{username} is already in all your rooms.
						</p>
					) : (
						<ul className='divide-y overflow-hidden rounded-xl border'>
							{rooms.map((room) => (
								<li key={room.room_id}>
									<InvitableRoomRow room={room} playerId={playerId} username={username} />
								</li>
							))}
						</ul>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function InvitableRoomRow({
	room,
	playerId,
	username,
}: Readonly<{ room: InvitableRoom; playerId: string; username: string }>) {
	const { mutate: invite, isPending } = useInviteToRoom(playerId);

	const handleInvite = () =>
		invite(room.room_id, {
			onSuccess: () => {
				toast.success(`Invite sent to ${username}.`, { position: "top-center" });
			},
			onError: (error) => {
				toast.error(inviteErrorCopy(error), { position: "top-center" });
			},
		});

	return (
		<div className='flex items-center gap-3 px-3 py-3'>
			<span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold'>
				{initialsOf(room.name)}
			</span>
			<span className='min-w-0 flex-1'>
				<span className='block truncate text-sm font-medium'>{room.name}</span>
				<span className='block text-xs tabular-nums text-muted-foreground'>
					{room.member_count} {room.member_count === 1 ? "player" : "players"}
				</span>
			</span>
			{room.invite_status === "available" ? (
				<Button size='sm' disabled={isPending} onClick={handleInvite}>
					{isPending ? <Spinner /> : null}
					Invite
				</Button>
			) : room.invite_status === "invited" ? (
				<span className='inline-flex items-center gap-1 text-xs font-medium text-muted-foreground'>
					<CheckIcon className='size-3.5' aria-hidden='true' />
					Invited
				</span>
			) : (
				<span className='text-xs text-muted-foreground'>
					{room.invite_status === "full" ? "Room full" : "Can't invite"}
				</span>
			)}
		</div>
	);
}

// The app's own words for what the server can refuse.
function inviteErrorCopy(error: unknown) {
	const code = (error as { code?: string } | null)?.code;
	if (code === "P0014") return "This room is full.";
	if (code === "P0013") return "They turned this one down recently. Try again in a few days.";
	if (code === "P0012") return "They can't rejoin this room.";
	return "Couldn't send the invite. Try again.";
}
