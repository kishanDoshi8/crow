import { usePlayer } from "@/features/home";
import { useCancelJoinRequest, useJoinRoom, useRoom } from "@/features/rooms/hooks/room";
import { Badge, Button, Loading, Spinner } from "@/shared/ui";
import { ChevronLeftIcon, Clock3Icon, UsersIcon } from "lucide-react";
import { LogoTile } from "@/features/share";
import { Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { savePostAuthRedirect } from "@/shared/lib/postAuthRedirect";

export function JoinRoomPage() {
	const navigate = useNavigate();
	const { roomCode } = useParams<{ roomCode: string }>();
	const location = useLocation();
	const { data: player, isPending: isPlayerLoading } = usePlayer();
	const { data: room, isPending: isRoomLoading, isError } = useRoom(roomCode);
	const { mutate: joinRoom, isPending: isJoining } = useJoinRoom();
	const { mutate: cancelRequest, isPending: isCancelling } = useCancelJoinRequest();

	if (isPlayerLoading || isRoomLoading) {
		return (
			<div className='flex items-center justify-center h-dvh'>
				<Loading className='size-10 text-primary' />
			</div>
		);
	}

	if (!player) {
		// New here: pick a name first, then come straight back to this room.
		savePostAuthRedirect(`${location.pathname}${location.search}`);
		return <Navigate to='/create-player' replace />;
	}

	// Codes are upper case; a link typed in lower case still works.
	if (roomCode && roomCode !== roomCode.toUpperCase()) {
		return (
			<Navigate
				to={`/rooms/${roomCode.toUpperCase()}/join${location.search}`}
				replace
			/>
		);
	}

	if (!room || isError || room.code !== roomCode) {
		return <Navigate to='/404' replace />;
	}

	// Only paths inside this room, so a crafted link can't send people elsewhere.
	const searchParams = new URLSearchParams(location.search);
	const requestedNext = searchParams.get("next");
	// Opened from Explore rather than an invite.
	const fromExplore = searchParams.get("ref") === "explore";
	const destination =
		requestedNext?.startsWith(`/rooms/${room.code}/`) && !requestedNext.includes("//")
			? requestedNext
			: `/rooms/${room.code}`;

	const isMember = room.members.some((member) => member.player_id === player.id);

	if (isMember) {
		return <Navigate to={destination} replace />;
	}

	const organizerName =
		room.organizer_username ??
		room.members.find((member) => member.role === "owner")?.player.username ??
		"Unknown";
	const memberCount = room.member_count ?? room.members.length;
	const predictionCount = room.active_prediction_count ?? 0;

	const needsRequest = room.join_policy === "request";
	const memberLimit = room.member_limit;

	const handleJoinRoom = () => {
		joinRoom(
			{ roomCode: room.code, ref: fromExplore ? "explore" : undefined },
			{
				onSuccess: (joinedRoom) => {
					if (joinedRoom.membership === "requested") {
						toast.success("Request sent", {
							description: `${room.name} will appear in your rooms once you're let in.`,
							position: "top-center",
						});
						return;
					}
					toast.success("Joined room successfully.");
					navigate(
						joinedRoom.code === room.code ? destination : `/rooms/${joinedRoom.code}`,
						{ replace: true },
					);
				},
				onError: (error) => {
					toast.error("Failed to join room.", {
						description: error.message,
					});
				},
			},
		);
	};

	const handleCancelRequest = () => {
		cancelRequest(
			{ roomId: room.id },
			{
				onError: (error) => {
					toast.error("Couldn't cancel the request.", {
						description: error.message,
						position: "top-center",
					});
				},
			},
		);
	};

	const handleBack = () => {
		if (globalThis.history.length > 1) {
			navigate(-1);
			return;
		}

		navigate("/", { replace: true });
	};

	return (
		<div className='min-h-dvh flex flex-col'>
			<header className='p-4'>
				<Button
					variant='ghost'
					size='icon'
					className='rounded-lg'
					onClick={handleBack}
					aria-label='Back'
				>
					<ChevronLeftIcon />
				</Button>
			</header>

			<main className='flex-1 w-full max-w-md mx-auto flex flex-col justify-center gap-6 px-4 pb-32'>
				{/* The same look as the invite card that brought them here. */}
				<div className='flex items-center gap-3'>
					<LogoTile size={48} />
					<span className='text-lg font-bold tracking-tighter'>crow</span>
				</div>

				<div className='flex flex-col gap-3'>
					<p className='text-muted-foreground'>
						{fromExplore ? "Public room" : "You're invited to"}
					</p>
					<h1 className='text-5xl font-bold leading-none tracking-tight wrap-anywhere'>
						{room.name}
					</h1>
					<div className='flex flex-wrap gap-2 pt-1'>
						<Badge variant='secondary' className='rounded-full px-3 py-1'>
							<UsersIcon />
							{memberLimit
								? `${memberCount} / ${memberLimit} players`
								: `${memberCount} ${memberCount === 1 ? "player" : "players"}`}
						</Badge>
						<Badge className='rounded-full bg-primary/15 px-3 py-1 text-primary'>
							<span aria-hidden='true'>●</span>
							{predictionCount} live
						</Badge>
					</div>
				</div>

				{room.description ? (
					<p className='text-foreground/85'>{room.description}</p>
				) : null}

				<dl className='grid gap-3 rounded-2xl border bg-card p-4 text-sm'>
					<div className='flex justify-between gap-4'>
						<dt className='text-muted-foreground'>Organized by</dt>
						<dd className='truncate font-medium'>{organizerName}</dd>
					</div>
					<div className='flex justify-between gap-4'>
						<dt className='text-muted-foreground'>Room code</dt>
						<dd className='font-medium tracking-widest'>{room.code}</dd>
					</div>
				</dl>

				<p className='text-sm text-muted-foreground'>
					Same points for everyone. Top balance when the series ends takes the
					title.
				</p>
			</main>

			<div className='fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 p-4 backdrop-blur-xl'>
				<div className='max-w-md mx-auto'>
					{room.is_removed ? (
						<p className='text-center text-sm text-muted-foreground'>
							You were removed from this room. Ask the owner to let you
							back in.
						</p>
					) : room.has_pending_request ? (
						<div className='flex items-center gap-3'>
							<Clock3Icon className='size-5 shrink-0 text-accent' aria-hidden='true' />
							<p className='min-w-0 flex-1 text-sm'>
								<span className='block font-semibold'>Request sent</span>
								<span className='block text-muted-foreground'>
									You'll be notified when you're let in.
								</span>
							</p>
							<Button variant='outline' onClick={handleCancelRequest} disabled={isCancelling}>
								{isCancelling && <Spinner />}
								Cancel request
							</Button>
						</div>
					) : room.is_full ? (
						<p className='text-center text-sm text-muted-foreground'>
							This room is full. Try another room, or ask a member for an
							invite once a place opens.
						</p>
					) : (
						<div className='flex flex-col gap-2'>
							<Button
								variant='linear'
								size='lg'
								className='w-full'
								onClick={handleJoinRoom}
								disabled={isJoining}
							>
								{isJoining && <Spinner />}
								{needsRequest ? "Request to join" : `Join ${room.name}`}
							</Button>
							{needsRequest ? (
								<p className='text-center text-xs text-muted-foreground'>
									The room's owner or an organizer lets you in.
								</p>
							) : null}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
