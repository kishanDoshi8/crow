import type { PredictionActivityMetadata, RoomActivity } from "@/features/activities/types/types";
import { FEATURES } from "@/shared/constants/features";

export function formatPoints(value: number | null | undefined) {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return "0";
	}
	return value.toLocaleString();
}

export function formatActivityTimestamp(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function resolveActivityHref(activity: RoomActivity, roomCode: string) {
	const action = activity.clickAction;
	if (!action) {
		return null;
	}

	if (action.type === "prediction") {
		return `/rooms/${roomCode}/predictions/${action.predictionId}`;
	}

	if (action.type === "duel") {
		// While duels are paused, open the prediction the duel was on.
		return FEATURES.duels
			? `/rooms/${roomCode}/predictions/${action.predictionId}/duels/${action.duelId}`
			: `/rooms/${roomCode}/predictions/${action.predictionId}`;
	}

	return null;
}

// "World Cup · #3", shown on prediction cards when the feed mixes series.
export function formatPredictionSeries(
	metadata: Pick<PredictionActivityMetadata, "seriesTitle" | "seriesPredictionNumber">,
) {
	if (!metadata.seriesTitle) return undefined;
	return metadata.seriesPredictionNumber
		? `${metadata.seriesTitle} · #${metadata.seriesPredictionNumber}`
		: metadata.seriesTitle;
}
