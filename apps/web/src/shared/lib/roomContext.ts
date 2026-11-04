import { useOutletContext } from "react-router-dom";
import type { Room } from "@/features/rooms/types/types";

// The room every page under RoomLayout renders in, passed down as the
// router's outlet context. Kept out of RoomLayout so features can read it
// without importing the layout, which imports their pages.
export type RoomOutletContext = {
	room: Room;
	roomCode: string;
};

export const useRoomContext = () => {
	const context = useOutletContext<RoomOutletContext>();
	if (!context) {
		throw new Error("useRoomContext must be used within a RoomLayout");
	}
	return context;
};
