import { getPlayer, createPlayer, setLastVisitedRoom } from "@/shared/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Player } from "@/features/home/types/player";
import { playerQueryKey } from "@/shared/constants/queryKeys";

export const usePlayer = () => {
    return useQuery({
        queryKey: playerQueryKey,
        queryFn: () => getPlayer(),
        retry: false,
        refetchInterval: 5 * 60 * 1000, // Refetch player data every 5 minutes
    });
}

export const useCreatePlayer = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (username: string) => createPlayer(username),
        onSuccess: async () => {
            const player = await getPlayer();
            queryClient.setQueryData(playerQueryKey, player);
        },
        onError: (error) => {
            console.error("Error creating player:", error);
        },
    })
}

export const useSetLastVisitedRoom = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (roomId: string) => setLastVisitedRoom(roomId),
		onSuccess: (_, roomId) => {
			queryClient.setQueryData(playerQueryKey, (currentPlayer: Player | undefined) =>
				currentPlayer
					? { ...currentPlayer, last_visited_room_id: roomId }
					: currentPlayer,
			);
		},
	});
};
