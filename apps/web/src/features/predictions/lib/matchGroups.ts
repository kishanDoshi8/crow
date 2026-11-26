import type { Prediction } from "@/features/predictions/types/types";
import type { Bet } from "@/features/predictions/types/bet";

// What Home's What's hot shows: a set of two or more questions (one match,
// "Arsenal vs Spurs") as one card, and any other question on its own.
// Groups keep the questions' order (soonest to close first), each placed
// where its first question would be.
export type QuestionGroup =
	| { kind: "single"; key: string; prediction: Prediction }
	| { kind: "set"; key: string; title: string; predictions: Prediction[] };

export function groupByMatch(predictions: Prediction[]): QuestionGroup[] {
	const sizes = new Map<string, number>();
	for (const prediction of predictions) {
		if (prediction.event_id) sizes.set(prediction.event_id, (sizes.get(prediction.event_id) ?? 0) + 1);
	}
	const groups: QuestionGroup[] = [];
	const sets = new Map<string, Extract<QuestionGroup, { kind: "set" }>>();
	for (const prediction of predictions) {
		const eventId = prediction.event_id;
		if (!eventId || (sizes.get(eventId) ?? 0) < 2) {
			groups.push({ kind: "single", key: prediction.id, prediction });
			continue;
		}
		const existing = sets.get(eventId);
		if (existing) {
			existing.predictions.push(prediction);
			continue;
		}
		const set = {
			kind: "set" as const,
			key: eventId,
			title: prediction.event_title ?? prediction.title,
			predictions: [prediction],
		};
		sets.set(eventId, set);
		groups.push(set);
	}
	return groups;
}

export function groupQuestions(group: QuestionGroup) {
	return group.kind === "set" ? group.predictions : [group.prediction];
}

// Where the player is with a group, for its dot: nothing open to pick
// ("closed"), none of the open ones picked, some, or all.
export type GroupProgress = "closed" | "none" | "some" | "all";

export function groupProgress(group: QuestionGroup, picks: Map<string, Bet | undefined>): GroupProgress {
	const open = groupQuestions(group).filter((prediction) => prediction.status === "draft");
	if (open.length === 0) return "closed";
	const picked = open.filter((prediction) => picks.get(prediction.id)).length;
	if (picked === 0) return "none";
	return picked === open.length ? "all" : "some";
}
