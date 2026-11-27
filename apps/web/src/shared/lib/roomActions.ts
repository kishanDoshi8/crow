import { createContext, useContext } from "react";

// Room-wide sheets any part of a room page can open: the room switcher, the
// series picker, the invite card, this room's notification settings and
// How to play.
// Provided by RoomLayout.
export type RoomActions = {
	openRoomSwitcher: () => void;
	openInvite: () => void;
	openNotifications: () => void;
	openSeriesPicker: () => void;
	openHowToPlay: () => void;
};

export const RoomActionsContext = createContext<RoomActions | null>(null);

export function useRoomActions(): RoomActions {
	const actions = useContext(RoomActionsContext);
	if (!actions) {
		throw new Error("useRoomActions must be used within a RoomLayout");
	}
	return actions;
}
