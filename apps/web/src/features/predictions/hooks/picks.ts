import { useQueries } from "@tanstack/react-query";
import { getBetsForPrediction } from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import type { Prediction } from "@/features/predictions/types/types";
import type { Bet } from "@/features/predictions/types/bet";
import { useActivePredictions } from "@/features/predictions/hooks/prediction";

// The player's own pick on each question, read from the same per-question
// cache the cards fill (useBets), so it costs no extra requests on Home and
// follows placing or taking back a pick straight away.
export function useMyPicks(roomId: string, predictions: Prediction[], playerId?: string) {
	const results = useQueries({
		queries: predictions.map((prediction) => ({
			queryKey: roomKeys.bets(roomId, prediction.id),
			queryFn: () => getBetsForPrediction(prediction.id),
			enabled: !!playerId,
		})),
	});
	const picks = new Map<string, Bet | undefined>();
	predictions.forEach((prediction, index) => {
		const bets = (results[index]?.data ?? []) as Bet[];
		picks.set(prediction.id, bets.find((bet) => bet.player_id === playerId));
	});
	const isPending = results.some((result) => result.isPending && result.fetchStatus !== "idle");
	return { picks, isPending };
}

// How far the player is through the questions open for picks.
export function pickProgress(predictions: Prediction[], picks: Map<string, Bet | undefined>) {
	const open = predictions.filter((prediction) => prediction.status === "draft");
	const picked = open.filter((prediction) => picks.get(prediction.id)).length;
	return { open: open.length, picked };
}

// The next question still open for picks that the player hasn't picked,
// leaving out the one they're on: the rest of the same match first, then
// the soonest to close.
export function useNextUnpicked(
	roomId: string,
	seriesId: string | null,
	currentPredictionId: string,
	playerId?: string,
) {
	const { data: predictions = [] } = useActivePredictions(roomId, seriesId ?? undefined);
	const { picks } = useMyPicks(roomId, predictions, playerId);
	const open = predictions.filter((prediction) => prediction.status === "draft");
	const eventId = predictions.find((prediction) => prediction.id === currentPredictionId)?.event_id ?? null;
	const sameMatch = (prediction: Prediction) => (eventId !== null && prediction.event_id === eventId ? 0 : 1);
	const remaining = open
		.filter((prediction) => prediction.id !== currentPredictionId && !picks.get(prediction.id))
		.filter((prediction) => new Date(prediction.deadline).getTime() > Date.now())
		.sort(
			(a, b) =>
				sameMatch(a) - sameMatch(b) ||
				new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
		);
	// After this pick lands, how many of the open questions are picked.
	const pickedAfter = open.filter(
		(prediction) => prediction.id === currentPredictionId || picks.get(prediction.id),
	).length;
	const next = remaining[0] ?? null;
	// "Next in Arsenal vs Spurs" while it's the same match.
	const nextMatch = next && eventId !== null && next.event_id === eventId ? (next.event_title ?? null) : null;
	return { next, nextMatch, remaining: remaining.length, open: open.length, pickedAfter };
}
