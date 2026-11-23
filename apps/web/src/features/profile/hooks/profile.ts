import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profileKeys } from "@/shared/constants/queryKeys";
import {
	getHeadToHead,
	getInvitableRooms,
	getPeopleYouPlayWith,
	getPlayerProfile,
	inviteToRoom,
} from "@/shared/lib/api";

// A player's profile across rooms. Leave playerId out (or null) for your own;
// someone else's covers only the rooms you share with them.
export const usePlayerProfile = (playerId: string | null = null, enabled = true) =>
	useQuery({
		queryKey: profileKeys.detail(playerId),
		queryFn: () => getPlayerProfile(playerId),
		enabled,
	});

// You against another player, over the questions you both picked.
export const useHeadToHead = (playerId: string | null, enabled = true) =>
	useQuery({
		queryKey: profileKeys.headToHead(playerId ?? ""),
		queryFn: () => getHeadToHead(playerId ?? ""),
		enabled: !!playerId && enabled,
	});

// Everyone you share a room with, most shared rooms first.
export const usePeopleYouPlayWith = (enabled = true) =>
	useQuery({
		queryKey: profileKeys.people(),
		queryFn: getPeopleYouPlayWith,
		enabled,
	});

// Your rooms you could invite this player to.
export const useInvitableRooms = (playerId: string, enabled = true) =>
	useQuery({
		queryKey: profileKeys.invitableRooms(playerId),
		queryFn: () => getInvitableRooms(playerId),
		enabled: !!playerId && enabled,
	});

export const useInviteToRoom = (playerId: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (roomId: string) => inviteToRoom(roomId, playerId),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: profileKeys.invitableRooms(playerId) }),
	});
};
