import type { Room } from "@/features/rooms/types/types";

// A player's name in this room, current or former, so old results keep the
// names they were played under. People who left show as "Raj (left)"; deleted
// accounts already carry their "Ghost crow" name.
export function roomPlayerName(
	room: Pick<Room, "members" | "former_members">,
	playerId: string | null | undefined,
): string | null {
	if (!playerId) return null;
	const member = room.members.find((m) => m.player_id === playerId);
	if (member) return member.player.username;
	const former = room.former_members?.find((m) => m.player_id === playerId);
	if (!former) return null;
	return former.status === "deleted"
		? former.username
		: `${former.username} (left)`;
}
