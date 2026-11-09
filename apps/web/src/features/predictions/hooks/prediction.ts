import { correctPredictionResult, createPrediction, deleteScheduledPrediction, getActivePrediction, getActivePredictions, getPrediction, getRoomTags, publishPredictionNow, resolvePrediction, setPredictionDetails, updatePrediction } from "@/shared/lib/api";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roomKeys } from "@/shared/constants/queryKeys";
import { invalidateRoomResults } from "@/shared/lib/roomCache";

export const useActivePrediction = (roomId?: string) => {
    return useQuery({
        queryKey: roomKeys.activePrediction(roomId ?? ""),
        queryFn: () => getActivePrediction(roomId ?? ""),
        enabled: !!roomId,
    });
}

// Returns all active (draft/locked) predictions for a room ordered by deadline asc.
// Falls back to the most recently completed prediction when no active ones exist.
export const useActivePredictions = (roomId?: string, seriesId?: string, enabled = true) => {
    return useQuery({
        queryKey: [...roomKeys.activePredictions(roomId ?? ""), seriesId ?? "all"],
        queryFn: () => getActivePredictions(roomId ?? "", seriesId),
        enabled: !!roomId && enabled,
        // Keep the previous series on screen while the next one loads.
        placeholderData: keepPreviousData,
    });
}

type CreatePredictionParams = {
    roomId: string;
    title: string;
    options: string[];
    deadline: Date;
    seriesId?: string | null;
    // Set to schedule it to go live later.
    opensAt?: Date | null;
    description?: string;
    tags?: string[];
}

export const useCreatePrediction = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreatePredictionParams) => {
            const created = await createPrediction(data.roomId, data.title, data.options, data.deadline, data.seriesId, data.opensAt);
            // Description and tags are saved alongside, once the prediction exists.
            if (data.description?.trim() || data.tags?.length) {
                await setPredictionDetails(created.id, data.description ?? '', data.tags ?? []);
            }
            return created;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({
                queryKey: roomKeys.activePrediction(data.room_id),
            });
            queryClient.invalidateQueries({
                queryKey: roomKeys.activePredictions(data.room_id),
            });
            queryClient.invalidateQueries({
                queryKey: roomKeys.manageQueue(data.room_id),
            });
        },
        onError: (error) => {
            console.error("Error creating prediction:", error);
        },
    });            
}

type ResolvePredictionParams = {
    predictionId: string;
    outcome: 'win' | 'no_result' | 'cancel';
    winningOptionId?: string;
    roomId: string;
    noResultReason?: string | null;
}

export const useResolvePrediction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: ResolvePredictionParams) =>
            resolvePrediction(data.predictionId, data.roomId, data.outcome, data.winningOptionId, data.noResultReason),
        onSuccess: (_, variables) => {
            invalidateRoomResults(queryClient, variables.roomId);
            // Covers the prediction, its bets and payouts.
            queryClient.invalidateQueries({
                queryKey: roomKeys.prediction(variables.roomId, variables.predictionId),
            });
        },
        onError: (error) => {
            console.error("Error resolving prediction:", error);
        },
    });
}

type CorrectPredictionParams = {
    predictionId: string;
    outcome: 'win' | 'no_result';
    winningOptionId?: string;
    roomId: string;
    noResultReason?: string | null;
}

// Organizers fix a revealed or no-result prediction. Points, ratings and
// streaks move, so everything a result touches is refetched.
export const useCorrectPrediction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CorrectPredictionParams) =>
            correctPredictionResult(data.predictionId, data.roomId, data.outcome, data.winningOptionId, data.noResultReason),
        onSuccess: (_, variables) => {
            invalidateRoomResults(queryClient, variables.roomId);
            queryClient.invalidateQueries({
                queryKey: roomKeys.prediction(variables.roomId, variables.predictionId),
            });
        },
    });
}

export const usePrediction = (roomId?: string, predictionId?: string) => {
    return useQuery({
        queryKey: roomKeys.prediction(roomId ?? "", predictionId ?? ""),
        queryFn: () => getPrediction(predictionId ?? ""),
        enabled: !!predictionId && !!roomId,
    });
}

type UpdatePredictionParams = {
    roomId: string;
    predictionId: string;
    title: string;
    deadline: Date;
    // Leave out to keep the current options.
    options?: string[];
    // A scheduled prediction's new go-live time.
    opensAt?: Date | null;
    description: string;
    tags: string[];
}

// Organizers fix a prediction that's still open for picks.
export const useUpdatePrediction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: UpdatePredictionParams) => {
            const updated = await updatePrediction(data.predictionId, data.title, data.deadline, data.options, data.opensAt);
            await setPredictionDetails(data.predictionId, data.description, data.tags);
            return updated;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: roomKeys.prediction(variables.roomId, variables.predictionId),
            });
            queryClient.invalidateQueries({
                queryKey: roomKeys.activePredictions(variables.roomId),
            });
            queryClient.invalidateQueries({
                queryKey: roomKeys.manageQueue(variables.roomId),
            });
        },
    });
}

// Tags used before in the room, most used first, to suggest while tagging.
export const useRoomTags = (roomId?: string) => {
    return useQuery({
        queryKey: roomKeys.roomTags(roomId ?? ""),
        queryFn: () => getRoomTags(roomId ?? ""),
        enabled: !!roomId,
        staleTime: 5 * 60 * 1000,
    });
}

// Scheduled predictions: put one live now, or delete it. Both change what's
// live and what's waiting, so the prediction, the live list and the manage
// queue are refreshed.
const useScheduledAction = (action: (predictionId: string) => Promise<unknown>) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ predictionId }: { roomId: string; predictionId: string }) => action(predictionId),
        onSuccess: (_, { roomId, predictionId }) => {
            queryClient.invalidateQueries({ queryKey: roomKeys.prediction(roomId, predictionId) });
            queryClient.invalidateQueries({ queryKey: roomKeys.activePredictions(roomId) });
            queryClient.invalidateQueries({ queryKey: roomKeys.manageQueue(roomId) });
        },
    });
};

export const usePublishPredictionNow = () => useScheduledAction(publishPredictionNow);
export const useDeleteScheduledPrediction = () => useScheduledAction(deleteScheduledPrediction);
