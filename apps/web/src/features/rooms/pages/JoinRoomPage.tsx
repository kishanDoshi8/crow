import { usePlayer } from "@/features/home";
import { useJoinRoom, useRoom } from "@/features/rooms/hooks/room";
import { Badge, Button, Loading, Spinner } from "@/shared/ui";
import { ChevronLeftIcon, UsersIcon } from "lucide-react";
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

	if (!room || isError || room.code !== roomCode) {
		return <Navigate to='/404' replace />;
	}

	// Only paths inside this room, so a crafted link can't send people elsewhere.
	const requestedNext = new URLSearchParams(location.search).get("next");
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

	const handleJoinRoom = () => {
		joinRoom(
			{ roomCode: room.code },
			{
				onSuccess: (joinedRoom) => {
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
					<p className='text-muted-foreground'>You're invited to</p>
					<h1 className='text-5xl font-bold leading-none tracking-tight wrap-anywhere'>
						{room.name}
					</h1>
					<div className='flex flex-wrap gap-2 pt-1'>
						<Badge variant='secondary' className='rounded-full px-3 py-1'>
							<UsersIcon />
							{memberCount} {memberCount === 1 ? "player" : "players"}
						</Badge>
						<Badge className='rounded-full bg-primary/15 px-3 py-1 text-primary'>
							<span aria-hidden='true'>●</span>
							{predictionCount} live
						</Badge>
					</div>
				</div>

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
					<Button
						variant='linear'
						size='lg'
						className='w-full'
						onClick={handleJoinRoom}
						disabled={isJoining}
					>
						{isJoining && <Spinner />}
						Join {room.name}
					</Button>
				</div>
			</div>
		</div>
	);
}
