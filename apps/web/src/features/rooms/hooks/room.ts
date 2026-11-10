import { clearReferral, peekReferral } from "@/shared/lib/referral";
import {
	cancelJoinRequest,
	createRoom,
	decideJoinRequest,
	getExploreRooms,
	getPlayerRooms,
	joinRoom,
	markRoomActivitiesSeen,
	spectateRoom,
} from "@/shared/lib/api";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roomKeys } from "@/shared/constants/queryKeys";
import type { Room } from "@/features/rooms/types/types";
import { playerQueryKey } from "@/shared/constants/queryKeys";

export const useRoom = (roomCode?: string) => {
    return useQuery({
        queryKey: roomKeys.byCode(roomCode ?? ""),
        queryFn: () => spectateRoom(roomCode ?? ""),
        enabled: !!roomCode,
        refetchInterval: 5 * 60 * 1000, // Refetch room data every 5 minutes
    });
}

type CreateRoomParams = {
    roomName: string;
}

export const useCreateRoom = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ roomName }: CreateRoomParams) => createRoom(roomName),
        onSuccess: (data) => {
            queryClient.setQueryData(roomKeys.byCode(data.code), data);
        },
    });
}

// Joins, or asks to join a room that approves new members. `ref` says where
// they found it (e.g. "explore"); otherwise the link they arrived with.
export const useJoinRoom = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ roomCode, ref }: { roomCode: string; ref?: string | null }) =>
            joinRoom(roomCode, ref ?? peekReferral()),
        onSuccess: (data) => {
            clearReferral();
            if (data.membership === "member") {
                queryClient.setQueryData(roomKeys.byCode(data.code), data);
            }
            void Promise.all([
                queryClient.invalidateQueries({
                    predicate: (query) => query.queryKey[0] === roomKeys.all[0],
                }),
                queryClient.invalidateQueries({ queryKey: playerQueryKey }),
            ]);
        },
    });
}

export const usePlayerRooms = (player_id: string) => {
    return useQuery({
        queryKey: roomKeys.byPlayer(player_id),
        queryFn: () => getPlayerRooms(player_id),
        retry: false,
        enabled: !!player_id,
    });
}

export const useMarkRoomActivitiesSeen = (roomCode?: string, roomId?: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => markRoomActivitiesSeen(roomId ?? ""),
        onSuccess: () => {
            if (roomCode) {
                // Hide the dot straight away, then confirm with the server.
                queryClient.setQueryData<Room>(roomKeys.byCode(roomCode), (room) =>
                    room ? { ...room, has_unseen_activities: false } : room,
                );
                void queryClient.invalidateQueries({
                    queryKey: roomKeys.byCode(roomCode),
                });
            }
        },
    });
}

// Public rooms for Explore, busiest first.
export const useExploreRooms = (search: string, enabled = true) => {
    return useQuery({
        queryKey: [...roomKeys.all, "explore", search] as const,
        queryFn: () => getExploreRooms(search),
        enabled,
        placeholderData: keepPreviousData,
    });
}

// Refreshes what a join request changes: the room (members, your pending
// request), Explore, the staff's queue and your room list.
const refreshAfterJoinRequest = (queryClient: ReturnType<typeof useQueryClient>) =>
    queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === roomKeys.all[0],
    });

export const useCancelJoinRequest = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ roomId }: { roomId: string }) => cancelJoinRequest(roomId),
        onSuccess: () => refreshAfterJoinRequest(queryClient),
    });
}

export const useDecideJoinRequest = (roomId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ playerId, accept }: { playerId: string; accept: boolean }) =>
            decideJoinRequest(roomId, playerId, accept),
        onSuccess: () => refreshAfterJoinRequest(queryClient),
    });
}
