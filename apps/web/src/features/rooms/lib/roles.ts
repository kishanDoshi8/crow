export type RoomRole = "owner" | "organizer" | "resolver" | "member";

const RANK: Record<RoomRole, number> = {
	member: 0,
	resolver: 1,
	organizer: 2,
	owner: 3,
};

export const ROLE_INFO: Record<RoomRole, { label: string; description: string }> = {
	owner: {
		label: "Owner",
		description: "Runs the room: settings, roles, and everything hosts do.",
	},
	organizer: {
		label: "Host",
		description: "Creates and edits questions and series, and reveals results.",
	},
	resolver: {
		label: "Ref",
		description: "Reveals results, ends questions with no result, and scraps questions.",
	},
	member: {
		label: "Player",
		description: "Plays: picks, standings, history.",
	},
};

// Roles the owner can hand out. Ownership moves only by transfer.
export const ASSIGNABLE_ROLES: RoomRole[] = ["member", "resolver", "organizer"];

export function hasRoomRole(role: RoomRole | null | undefined, min: RoomRole) {
	return role != null && RANK[role] >= RANK[min];
}

export function roomRoleRank(role: RoomRole) {
	return RANK[role];
}
