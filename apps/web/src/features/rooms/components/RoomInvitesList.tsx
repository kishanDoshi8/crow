import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useMyRoomInvites, useRespondToRoomInvite } from "@/features/rooms/hooks/invites";
import type { RoomInvite } from "@/shared/lib/api";
import { initialsOf } from "@/shared/lib/utils";
import { Button, Spinner } from "@/shared/ui";

type Props = {
	// Called once you're in a room, e.g. to close the room switcher.
	onJoined?: () => void;
};

// Invites from people you play with, above your room list. Shows nothing
// when there are none.
export function RoomInvitesList({ onJoined }: Readonly<Props>) {
	const { data: invites } = useMyRoomInvites();
	if (!invites?.length) return null;

	return (
		<section aria-labelledby='room-invites-heading' className='flex flex-col gap-2'>
			<h2 id='room-invites-heading' className='flex items-center gap-2 text-sm font-semibold'>
				Invites
				<span className='rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary'>
					{invites.length}
				</span>
			</h2>
			<ul className='flex flex-col gap-2'>
				{invites.map((invite) => (
					<li key={invite.room_id}>
						<InviteCard invite={invite} onJoined={onJoined} />
					</li>
				))}
			</ul>
		</section>
	);
}

function InviteCard({ invite, onJoined }: Readonly<{ invite: RoomInvite; onJoined?: () => void }>) {
	const navigate = useNavigate();
	const { mutate: respond, isPending, variables } = useRespondToRoomInvite();
	const who = invite.invited_by_username ?? "Someone";

	const handleRespond = (accept: boolean) => {
		respond(
			{ roomId: invite.room_id, accept },
			{
				onSuccess: (result) => {
					if (!accept) return;
					if (result.membership === "requested") {
						toast.success("Request sent. The hosts will let you in.", { position: "top-center" });
						return;
					}
					toast.success(`You're in ${invite.room_name}.`, { position: "top-center" });
					onJoined?.();
					navigate(`/rooms/${invite.room_code}`);
				},
				onError: (error) => {
					toast.error(inviteErrorCopy(error, accept), { position: "top-center" });
				},
			},
		);
	};

	return (
		<div className='flex flex-col gap-3 rounded-xl border bg-card p-3'>
			<div className='flex items-center gap-3'>
				<span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold'>
					{initialsOf(invite.room_name)}
				</span>
				<div className='min-w-0 flex-1'>
					<p className='truncate text-sm font-semibold'>{invite.room_name}</p>
					<p className='text-xs text-muted-foreground wrap-anywhere'>{who} invited you</p>
				</div>
				<span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
					{invite.member_count} {invite.member_count === 1 ? "player" : "players"}
				</span>
			</div>
			{invite.needs_approval ? (
				<p className='text-xs text-muted-foreground'>
					This room's hosts approve new players, so saying yes sends them a request.
				</p>
			) : null}
			<div className='grid grid-cols-2 gap-2'>
				<Button variant='outline' disabled={isPending} onClick={() => handleRespond(false)}>
					{isPending && variables?.accept === false ? <Spinner /> : null}
					Not now
				</Button>
				<Button disabled={isPending} onClick={() => handleRespond(true)}>
					{isPending && variables?.accept === true ? <Spinner /> : null}
					{invite.needs_approval ? "Ask to join" : "Join"}
				</Button>
			</div>
		</div>
	);
}

// The app's own words for what the server can refuse.
function inviteErrorCopy(error: unknown, accept: boolean) {
	const code = (error as { code?: string } | null)?.code;
	if (code === "P0014") return "This room is full.";
	if (code === "P0012") return "You can't rejoin this room. Ask its owner to let you back in.";
	if (code === "P0013") return "Your last request was turned down. You can ask again in a few days.";
	if (code === "P0002") return "This invite isn't open any more.";
	return accept ? "Couldn't join the room. Try again." : "Couldn't answer the invite. Try again.";
}
