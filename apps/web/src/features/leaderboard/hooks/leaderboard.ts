import {
    getRoomMemberRecentPredictions,
    getRoomMemberStats,
    getRoomPredictionHistory,
    getRoomPredictionHistoryCounts,
    getRoomMemberSeriesRecognition,
    getRoomMemberMilestones,
    getRoomMemberStyle,
    getSeriesLeaderboard,
    getSeriesWeeklyRecap,
    getRoomOverallStandings,
} from '@/shared/lib/api'
import type {
	PredictionHistoryFilter,
	PredictionHistoryPage,
} from "@/features/leaderboard/types/types";
import type { InfiniteData} from '@tanstack/react-query';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { roomKeys } from '@/shared/constants/queryKeys'

// Last week's top 5 and biggest movers, for the weekly share card.
export const useSeriesWeeklyRecap = (
    roomId?: string,
    seriesId?: string | null,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.seriesWeeklyRecap(roomId ?? '', seriesId ?? ''),
        queryFn: () => getSeriesWeeklyRecap(roomId ?? '', seriesId ?? ''),
        enabled: !!roomId && !!seriesId && enabled,
    })
}

// Series standings, ranked by wallet balance.
export const useSeriesLeaderboard = (
    roomId?: string,
    seriesId?: string | null,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.seriesLeaderboard(roomId ?? '', seriesId ?? ''),
        queryFn: () => getSeriesLeaderboard(roomId ?? '', seriesId ?? '', 'points'),
        enabled: !!roomId && !!seriesId && enabled,
        // Keep the previous series on screen while the next one loads.
        placeholderData: keepPreviousData,
    })
}

// Standings across every series, ranked by total profit.
export const useRoomOverallStandings = (roomId?: string, enabled = true) => {
    return useQuery({
        queryKey: roomKeys.overallStandings(roomId ?? ''),
        queryFn: () => getRoomOverallStandings(roomId ?? ''),
        enabled: !!roomId && enabled,
    })
}

type PredictionHistoryCursor = {
    cursorCreatedAt: string | null
    cursorId: string | null
}

const DEFAULT_PREDICTION_HISTORY_LIMIT = 20

export const usePredictionHistory = (
    roomId?: string,
    filter: PredictionHistoryFilter = 'all',
    search = '',
    seriesId?: string,
) => {
    const initialCursor: PredictionHistoryCursor = {
        cursorCreatedAt: null,
        cursorId: null,
    }

    return useInfiniteQuery<
        PredictionHistoryPage,
        Error,
        InfiniteData<PredictionHistoryPage, PredictionHistoryCursor>,
        readonly [string, string, PredictionHistoryFilter, string, string],
        PredictionHistoryCursor
    >({
        queryKey: ['prediction-history', roomId ?? '', filter, search, seriesId ?? 'all'],
        queryFn: ({ pageParam }) =>
            getRoomPredictionHistory({
                roomId: roomId ?? '',
                limit: DEFAULT_PREDICTION_HISTORY_LIMIT,
                cursorCreatedAt: pageParam.cursorCreatedAt,
                cursorId: pageParam.cursorId,
                search,
                filter,
                seriesId,
            }),
        initialPageParam: initialCursor,
        // Keep the previous results on screen while the next filter loads.
        placeholderData: keepPreviousData,
        getNextPageParam: (lastPage) => {
            if (!lastPage.has_more) return undefined
            if (!lastPage.next_cursor_created_at || !lastPage.next_cursor_id) {
                return undefined
            }

            return {
                cursorCreatedAt: lastPage.next_cursor_created_at,
                cursorId: lastPage.next_cursor_id,
            } satisfies PredictionHistoryCursor
        },
        enabled: !!roomId,
    })
}


export const useRoomMemberStats = (
    roomId?: string,
    playerId?: string | null,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.roomMemberStats(roomId ?? "", playerId ?? ""),
        queryFn: () => getRoomMemberStats(roomId ?? "", playerId ?? ""),
        enabled: !!roomId && !!playerId && enabled,
    })
}

export const useRoomMemberRecentPredictions = (
    roomId?: string,
    playerId?: string | null,
    limit = 5,
    offset = 0,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.roomMemberRecentPredictions(
            roomId ?? "",
            playerId ?? "",
            limit,
            offset,
        ),
        queryFn: () =>
            getRoomMemberRecentPredictions(
                roomId ?? "",
                playerId ?? "",
                limit,
                offset,
            ),
        enabled: !!roomId && !!playerId && enabled,
    })
}

export const useRoomMemberSeriesRecognition = (
    roomId?: string,
    playerId?: string | null,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.roomMemberSeriesRecognition(roomId ?? "", playerId ?? ""),
        queryFn: () => getRoomMemberSeriesRecognition(roomId ?? "", playerId ?? ""),
        enabled: !!roomId && !!playerId && enabled,
    })
}

export const useRoomMemberMilestones = (
    roomId?: string,
    playerId?: string | null,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.roomMemberMilestones(roomId ?? "", playerId ?? ""),
        queryFn: () => getRoomMemberMilestones(roomId ?? "", playerId ?? ""),
        enabled: !!roomId && !!playerId && enabled,
    })
}

export const useRoomMemberStyle = (
    roomId?: string,
    playerId?: string | null,
    enabled = true,
) => {
    return useQuery({
        queryKey: roomKeys.roomMemberStyle(roomId ?? "", playerId ?? ""),
        queryFn: () => getRoomMemberStyle(roomId ?? "", playerId ?? ""),
        enabled: !!roomId && !!playerId && enabled,
    })
}

// The number on each History filter. Shares the history list's key prefix,
// so anything that refreshes the list (a new result) refreshes these too.
export const usePredictionHistoryCounts = (
    roomId?: string,
    search = '',
    seriesId?: string,
) => {
    return useQuery({
        queryKey: ['prediction-history', roomId ?? '', 'counts', search, seriesId ?? 'all'],
        queryFn: () => getRoomPredictionHistoryCounts(roomId ?? '', seriesId, search),
        enabled: !!roomId,
        placeholderData: keepPreviousData,
    })
}
