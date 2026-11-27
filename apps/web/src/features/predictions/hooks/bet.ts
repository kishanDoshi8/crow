import {
	cancelBet,
	getBetsForPrediction,
	getPickCounts,
	placeBet,
	type SeriesWallet,
} from "@/shared/lib/api";
import type { QueryClient} from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roomKeys } from "@/shared/constants/queryKeys";
import type { Bet } from "@/features/predictions/types/bet";
import type { Prediction } from "@/features/predictions/types/types";
import { splitHidden, tallyOptions } from "@/features/predictions/lib/predictionView";

// Moves points into or out of escrow in the cached series wallet, so the
// available balance updates before the server answers.
function adjustCachedWalletEscrow(
    queryClient: QueryClient,
    roomId: string,
    seriesId: string | null,
    escrowDelta: number,
) {
    queryClient.setQueryData<SeriesWallet[]>(roomKeys.seriesWallets(roomId), (old) =>
        old?.map((wallet) =>
            wallet.series_id === seriesId
                ? {
                    ...wallet,
                    escrow: wallet.escrow + escrowDelta,
                    available: wallet.available - escrowDelta,
                }
                : wallet
        )
    );
}

export const useBets = (roomId: string, predictionId?: string) => {
    return useQuery({
        queryKey: roomKeys.bets(roomId, predictionId ?? ""),
        queryFn: () => getBetsForPrediction(predictionId ?? ""),
        enabled: !!predictionId,
    });
}

// How many picks, points and players open predictions have. Their bets are
// hidden until they lock, so they can't be counted from useBets.
export const usePickCounts = (roomId: string, predictionIds: string[], enabled = true) => {
    return useQuery({
        queryKey: roomKeys.pickCounts(roomId, predictionIds),
        queryFn: () => getPickCounts(predictionIds),
        enabled: predictionIds.length > 0 && enabled,
    });
}

// Options with their share of the points, plus the points in play and the
// pick count. While picks are open the shares stay hidden (splitHidden) and
// the totals come from usePickCounts, since only your own bet is readable.
export const useTally = (
    roomId: string,
    prediction: Pick<Prediction, "id" | "status" | "prediction_options">,
    bets: Pick<Bet, "option_id" | "amount">[],
) => {
    const hidden = splitHidden(prediction.status);
    const { data: count } = usePickCounts(roomId, [prediction.id], hidden);
    const tally = tallyOptions(prediction, bets);
    return hidden
        ? { ...tally, pool: count?.pool ?? 0, picks: count?.picks ?? 0, hidden }
        : { ...tally, hidden };
}

const invalidatePicks = (queryClient: QueryClient, roomId: string, predictionId: string) => {
    queryClient.invalidateQueries({ queryKey: roomKeys.bets(roomId, predictionId) });
    // Every count this question is part of: its own and its match's.
    queryClient.invalidateQueries({ queryKey: roomKeys.pickCounts(roomId) });
    // "Make your first pick" on the Getting started checklist.
    queryClient.invalidateQueries({ queryKey: roomKeys.checklist(roomId) });
}

type PlaceBetParams = {
    roomId: string;
    playerId: string;
    predictionId: string;
    seriesId: string | null;
    optionId: string;
    amount: number;
}

export const usePlaceBet = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: PlaceBetParams) =>
        placeBet(data.predictionId, data.optionId, data.amount),

        onMutate: async (variables) => {
        const walletsKey = roomKeys.seriesWallets(variables.roomId);
        await queryClient.cancelQueries({ queryKey: walletsKey });

        const previousWallets = queryClient.getQueryData<SeriesWallet[]>(walletsKey);
        const previousBet = queryClient.getQueryData<Bet>(
            roomKeys.myBet(variables.roomId, variables.predictionId, variables.playerId)
        );

        const oldAmount = previousBet?.amount ?? 0;
        const escrowDelta = variables.amount - oldAmount;

        // update bet cache
        queryClient.setQueryData(
            roomKeys.myBet(variables.roomId, variables.predictionId, variables.playerId),
            {
            prediction_id: variables.predictionId,
            option_id: variables.optionId,
            amount: variables.amount,
            }
        );

        adjustCachedWalletEscrow(queryClient, variables.roomId, variables.seriesId, escrowDelta);

        // Move the bet in the list too, so option totals follow a switch at once.
        const betsKey = roomKeys.bets(variables.roomId, variables.predictionId);
        await queryClient.cancelQueries({ queryKey: betsKey });
        const previousBets = queryClient.getQueryData<Bet[]>(betsKey);
        queryClient.setQueryData<Bet[]>(betsKey, (old) => {
            if (!old) return old;
            const exists = old.some((bet) => bet.player_id === variables.playerId);
            return exists
                ? old.map((bet) =>
                    bet.player_id === variables.playerId
                        ? { ...bet, option_id: variables.optionId, amount: variables.amount }
                        : bet
                )
                : [
                    ...old,
                    {
                        id: `optimistic-${variables.playerId}`,
                        prediction_id: variables.predictionId,
                        player_id: variables.playerId,
                        option_id: variables.optionId,
                        amount: variables.amount,
                        payout: null,
                    },
                ];
        });

        return { previousWallets, previousBet, previousBets };
        },

        onError: (_err, variables, context) => {
        // rollback
        if (context?.previousWallets) {
            queryClient.setQueryData(roomKeys.seriesWallets(variables.roomId), context.previousWallets);
        }
        if (context) {
            // A failed first bet leaves no bet behind.
            queryClient.setQueryData(
            roomKeys.myBet(variables.roomId, variables.predictionId, variables.playerId),
            context.previousBet ?? null
            );
        }
        if (context?.previousBets) {
            queryClient.setQueryData(
            roomKeys.bets(variables.roomId, variables.predictionId),
            context.previousBets
            );
        }
        },

        onSettled: (_data, _err, variables) => {
        invalidatePicks(queryClient, variables.roomId, variables.predictionId);

        queryClient.invalidateQueries({
            queryKey: roomKeys.seriesWallets(variables.roomId),
        });
        },
    });
};

type CancelBetParams = {
    roomId: string;
    playerId: string;
    predictionId: string;
    seriesId: string | null;
}

export const useCancelBet = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ predictionId }: CancelBetParams) =>
        cancelBet(predictionId),

        onMutate: async (variables) => {
        const walletsKey = roomKeys.seriesWallets(variables.roomId);
        await queryClient.cancelQueries({ queryKey: walletsKey });

        const betKey = roomKeys.myBet(
            variables.roomId,
            variables.predictionId,
            variables.playerId
        );

        const previousBet = queryClient.getQueryData<Bet>(betKey);
        const previousWallets = queryClient.getQueryData<SeriesWallet[]>(walletsKey);

        const oldAmount = previousBet?.amount ?? 0;

        // remove bet
        queryClient.setQueryData(betKey, null);

        // remove from bets list
        queryClient.setQueryData<Bet[]>(
            roomKeys.bets(variables.roomId, variables.predictionId),
            (old) => old?.filter((b) => b.player_id !== variables.playerId) ?? []
        );

        // release escrow
        adjustCachedWalletEscrow(queryClient, variables.roomId, variables.seriesId, -oldAmount);

        return { previousBet, previousWallets };
        },

        onError: (_err, variables, context) => {
        if (!context) return;

        if (context.previousBet) {
            queryClient.setQueryData(
            roomKeys.myBet(
                variables.roomId,
                variables.predictionId,
                variables.playerId
            ),
            context.previousBet
            );
        }

        if (context.previousWallets) {
            queryClient.setQueryData(roomKeys.seriesWallets(variables.roomId), context.previousWallets);
        }
        },

        onSettled: (_data, _err, variables) => {
        invalidatePicks(queryClient, variables.roomId, variables.predictionId);

        queryClient.invalidateQueries({
            queryKey: roomKeys.seriesWallets(variables.roomId),
        });
        },
    });
};