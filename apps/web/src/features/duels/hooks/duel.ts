import {
	cancelDuelQueue,
	cancelDuel,
	createDuel,
	getPredictionDuelSummary,
	getPredictionDuels,
	joinDuelQueue,
} from "@/shared/lib/api";
import type { DuelSummary } from "@/features/duels/types/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { playerQueryKey, roomKeys } from "@/shared/constants/queryKeys";

export const usePredictionDuels = (roomId: string, predictionId?: string) => {
	return useQuery({
		queryKey: roomKeys.duels(roomId, predictionId ?? ""),
		queryFn: () => getPredictionDuels(predictionId ?? ""),
		enabled: !!predictionId,
	});
};

export const usePredictionDuelSummary = (roomId: string, predictionId?: string) => {
	return useQuery<DuelSummary>({
		queryKey: roomKeys.duelSummary(roomId, predictionId ?? ""),
		queryFn: () => getPredictionDuelSummary(predictionId ?? ""),
		enabled: !!predictionId,
	});
};

type CreateDuelParams = {
	roomId: string;
	predictionId: string;
	challengerPlayerId: string;
	betId: string;
	stakeAmount: number;
};

export const useCreateDuel = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			predictionId,
			challengerPlayerId,
			betId,
			stakeAmount,
		}: CreateDuelParams) =>
			createDuel(
				predictionId,
				challengerPlayerId,
				betId,
				stakeAmount,
			),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: roomKeys.duels(
					variables.roomId,
					variables.predictionId,
				),
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.duelSummary(
					variables.roomId,
					variables.predictionId,
				),
			});
			queryClient.invalidateQueries({
				queryKey: playerQueryKey,
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.bets(
					variables.roomId,
					variables.predictionId,
				),
			});
		},
	});
};

type JoinDuelQueueParams = {
	roomId: string;
	predictionId: string;
	duelId: string;
	playerId: string;
	betId: string;
};

export const useJoinDuelQueue = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ duelId, playerId, betId }: JoinDuelQueueParams) =>
			joinDuelQueue(duelId, playerId, betId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: roomKeys.duels(variables.roomId, variables.predictionId),
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.duelSummary(
					variables.roomId,
					variables.predictionId,
				),
			});
			queryClient.invalidateQueries({
				queryKey: playerQueryKey,
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.bets(variables.roomId, variables.predictionId),
			});
		},
	});
};

type CancelDuelQueueParams = {
	roomId: string;
	predictionId: string;
	duelId: string;
	playerId: string;
};

export const useCancelDuelQueue = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ duelId, playerId }: CancelDuelQueueParams) =>
			cancelDuelQueue(duelId, playerId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: roomKeys.duels(variables.roomId, variables.predictionId),
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.duelSummary(
					variables.roomId,
					variables.predictionId,
				),
			});
			queryClient.invalidateQueries({
				queryKey: playerQueryKey,
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.bets(variables.roomId, variables.predictionId),
			});
		},
	});
};

type CancelDuelParams = {
	roomId: string;
	predictionId: string;
	duelId: string;
	playerId: string;
};

export const useCancelDuel = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ duelId, playerId }: CancelDuelParams) =>
			cancelDuel(duelId, playerId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: roomKeys.duels(variables.roomId, variables.predictionId),
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.duelSummary(
					variables.roomId,
					variables.predictionId,
				),
			});
			queryClient.invalidateQueries({
				queryKey: playerQueryKey,
			});
			queryClient.invalidateQueries({
				queryKey: roomKeys.bets(variables.roomId, variables.predictionId),
			});
		},
	});
};
