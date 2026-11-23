import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	playerQueryKey,
	profileKeys,
	roomInvitesKey,
	roomKeys,
} from "@/shared/constants/queryKeys";
import { getMyRoomInvites, respondToRoomInvite } from "@/shared/lib/api";

// Room invites waiting on you.
export const useMyRoomInvites = (enabled = true) =>
	useQuery({
		queryKey: roomInvitesKey,
		queryFn: getMyRoomInvites,
		enabled,
	});

// Yes joins the room (or asks to, if it approves new players); no turns it down.
export const useRespondToRoomInvite = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roomId, accept }: { roomId: string; accept: boolean }) =>
			respondToRoomInvite(roomId, accept),
		onSettled: (_data, _error, { accept }) =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: roomInvitesKey }),
				...(accept
					? [
							queryClient.invalidateQueries({
								predicate: (query) => query.queryKey[0] === roomKeys.all[0],
							}),
							queryClient.invalidateQueries({ queryKey: playerQueryKey }),
							queryClient.invalidateQueries({ queryKey: profileKeys.all }),
						]
					: []),
			]),
	});
};
