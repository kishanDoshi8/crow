import { useCancelDuel, useCancelDuelQueue, useJoinDuelQueue } from "@/features/duels/hooks/duel";
import type { Duel } from "@/features/duels/types/types";
import type { Prediction } from "@/features/predictions";
import { toast } from "sonner";

interface UsePredictionDuelActionsArgs {
    roomId: string;
    duel: Duel | undefined;
    prediction: Prediction | null | undefined;
    playerId: string | undefined;
    myBetId: string | undefined;
}

export function usePredictionDuelActions({
    roomId,
    duel,
    prediction,
    playerId,
    myBetId,
}: Readonly<UsePredictionDuelActionsArgs>) {
    const { mutate: joinDuelQueue, isPending: isJoining } = useJoinDuelQueue();
    const { mutate: cancelDuelQueue, isPending: isLeavingQueue } =
        useCancelDuelQueue();
    const { mutate: cancelDuel, isPending: isCancelling } = useCancelDuel();

    const onCommitEscrow = () => {
        if (!playerId || !duel || !prediction || !myBetId) return;
        joinDuelQueue(
            {
                roomId,
                predictionId: prediction.id,
                duelId: duel.id,
                playerId,
                betId: myBetId,
            },
            {
                onSuccess: () => {
                    toast.success("Joined duel queue.");
                },
                onError: (error) => {
                    toast.error("Could not join duel queue.", {
                        description: error.message,
                    });
                },
            },
        );
    };

    const onCancelDuel = () => {
        if (!playerId || !duel || !prediction) return;
        cancelDuel(
            {
                roomId,
                predictionId: prediction.id,
                duelId: duel.id,
                playerId,
            },
            {
                onSuccess: () => {
                toast.success("Duel cancelled.");
            },
                onError: (error) => {
                    toast.error("Could not cancel duel.", {
                        description: error.message,
                    });
                },
            },
        );
    };

    const onCancelQueue = () => {
        if (!playerId || !duel || !prediction) return;
        cancelDuelQueue(
            {
                roomId,
                predictionId: prediction.id,
                duelId: duel.id,
                playerId,
            },
            {
                onSuccess: () => {
                    toast.success("Left duel queue.");
                },
                onError: (error) => {
                    toast.error("Could not leave duel queue.", {
                        description: error.message,
                    });
                },
            },
        );
    };

    return {
        onCommitEscrow,
        onCancelDuel,
        onCancelQueue,
        isJoining,
        isLeavingQueue,
        isCancelling,
    };
}
