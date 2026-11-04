import type { HomeTab } from "@/features/home/components/Home";
import Home from "@/features/home/components/Home";
import { useAppNavigation } from "@/shared/lib/navigation";
import { joinRoom } from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { usePlayer } from "@/features/home/hooks/player";
import { usePlayerRooms } from "@/features/rooms/hooks/room";
import { Loading } from "@/shared/ui";

export function HomePage() {
	const navigate = useNavigate();
	const { switchRoom } = useAppNavigation();
	const [searchParams] = useSearchParams();
	const { data: player, isPending: isPlayerLoading } = usePlayer();
	const queryClient = useQueryClient();
	const requestedTab = getHomeTab(searchParams.get("tab"));
	const hasExplicitTab = requestedTab !== null;
	const {
		data: playerRooms,
		isPending: isPlayerRoomsLoading,
		error: playerRoomsError,
	} = usePlayerRooms(player?.id ?? "");

	const [roomCode, setRoomCode] = React.useState("");
	const [validatedCode, setValidatedCode] = React.useState(false);

	const [isLoading, setIsLoading] = React.useState(false);

	useEffect(() => {
		if (!isPlayerLoading && !player) {
			navigate("/create-player", { replace: true });
		}
	}, [player, isPlayerLoading, navigate]);

	useEffect(() => {
		if (
			!player ||
			isPlayerLoading ||
			isPlayerRoomsLoading ||
			hasExplicitTab
		) {
			return;
		}

		if (!playerRooms?.length || !player.last_visited_room_id) {
			return;
		}

		const lastVisitedRoom = playerRooms.find(
			(room) => room.id === player.last_visited_room_id,
		);

		if (!lastVisitedRoom) {
			return;
		}

		navigate(`/rooms/${lastVisitedRoom.code}`, { replace: true });
	}, [
		player,
		playerRooms,
		isPlayerLoading,
		isPlayerRoomsLoading,
		hasExplicitTab,
		navigate,
	]);

	useEffect(() => {
		if (roomCode.length === 6) {
			handleEnterRoom();
		}
	}, [roomCode]);

	const handleEnterRoom = async () => {
		if (roomCode.length === 6) {
			setIsLoading(true);
			try {
				const room = await queryClient.fetchQuery({
					queryKey: roomKeys.byCode(roomCode),
					queryFn: () => joinRoom(roomCode),
				});
				switchRoom(room.code);
			} catch (error) {
				toast("Failed to enter room.", {
					description: (error as Error).message,
				});
				setValidatedCode(true); // Set validation state to true if code is invalid
			} finally {
				setIsLoading(false);
			}
		} else {
			setValidatedCode(true); // Set validation state to true if code is invalid
		}
	};

	// Only hold on the spinner while we're about to jump back into the last room.
	const lastVisitedRoom = playerRooms?.find(
		(room) => room.id === player?.last_visited_room_id,
	);
	const willRedirect =
		!hasExplicitTab &&
		!!player?.last_visited_room_id &&
		(isPlayerRoomsLoading || !!lastVisitedRoom);

	if (isPlayerLoading || willRedirect) {
		return (
			<div className='flex items-center justify-center h-dvh'>
				<Loading className={`size-10 text-primary`} />
			</div>
		);
	}

	return (
		<Home
			roomCode={roomCode}
			setRoomCode={setRoomCode}
			validatedCode={validatedCode}
			setValidatedCode={setValidatedCode}
			isLoading={isLoading}
			handleEnterRoom={handleEnterRoom}
			defaultTab={requestedTab ?? "rooms"}
			playerRooms={playerRooms}
			isPlayerRoomsLoading={isPlayerRoomsLoading}
			playerRoomsError={playerRoomsError}
		/>
	);
}

function getHomeTab(tab: string | null): HomeTab | null {
	if (tab === "rooms" || tab === "join" || tab === "create") {
		return tab;
	}
	return null;
}
