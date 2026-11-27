import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { hasPickInRoom, roomHasQuestions } from "@/shared/lib/api";
import { roomKeys } from "@/shared/constants/queryKeys";
import { usePlayer } from "@/features/home";
// From the hooks file: the preferences entry point also exports its dialog,
// which imports predictions, which imports rooms.
import { usePreferences } from "@/features/preferences/hooks/preferences";
import { useCurrentSeries } from "@/features/series";
import { useNotificationPermission } from "@/shared/hooks/useNotificationPermission";
import type { Room } from "@/features/rooms/types/types";

// The Getting started checklist for one room: a short list for players
// (join, see how it works, first pick, notifications) and one for hosts
// (start a series, add questions, three players, notifications). Each step
// ticks itself off from real data; nothing is ticked by hand.
//
// It's per room because the steps are about this room. Whether it's hidden,
// and which ticks have already been celebrated, is kept on this device.

export type ChecklistStepId =
	| "joined"
	| "how_it_works"
	| "first_pick"
	| "notifications"
	| "created"
	| "series"
	| "questions"
	| "players";

export type ChecklistStep = { id: ChecklistStepId; done: boolean };

type Stored = { hidden?: boolean; celebrated?: ChecklistStepId[]; finished?: boolean };

const storageKey = (roomId: string) => `crow-checklist-${roomId}`;
const CHANGED = "crow-checklist-change";

function read(roomId: string): Stored {
	try {
		return JSON.parse(localStorage.getItem(storageKey(roomId)) ?? "{}") as Stored;
	} catch {
		return {};
	}
}

function write(roomId: string, next: Stored) {
	try {
		localStorage.setItem(storageKey(roomId), JSON.stringify(next));
	} catch {
		// Storage unavailable: the checklist just shows again next time.
	}
	globalThis.dispatchEvent(new Event(CHANGED));
}

function parseStored(raw: string): Stored {
	try {
		return JSON.parse(raw) as Stored;
	} catch {
		return {};
	}
}

function subscribe(onChange: () => void) {
	globalThis.addEventListener(CHANGED, onChange);
	globalThis.addEventListener("storage", onChange);
	return () => {
		globalThis.removeEventListener(CHANGED, onChange);
		globalThis.removeEventListener("storage", onChange);
	};
}

// What this device remembers about the room's checklist, shared live
// between Home and the room menu.
export function useChecklistMemory(roomId: string) {
	const raw = useSyncExternalStore(
		subscribe,
		() => {
			try {
				return localStorage.getItem(storageKey(roomId)) ?? "{}";
			} catch {
				return "{}";
			}
		},
		() => "{}",
	);
	const stored = parseStored(raw);
	const update = useCallback(
		(change: Partial<Stored>) => write(roomId, { ...read(roomId), ...change }),
		[roomId],
	);
	return { stored, update };
}

export function useRoomChecklist(room: Room, isHost: boolean) {
	const { data: player } = usePlayer();
	const { data: preferences } = usePreferences(room.id);
	const { seriesOptions, isPending: isSeriesPending } = useCurrentSeries(room.id);
	const { permission } = useNotificationPermission();

	const { data: checks, isPending: isChecksPending } = useQuery({
		queryKey: [...roomKeys.checklist(room.id), player?.id ?? "", isHost],
		queryFn: async () => {
			const [picked, hasQuestions] = await Promise.all([
				isHost ? Promise.resolve(false) : hasPickInRoom(room.id, player?.id ?? ""),
				isHost ? roomHasQuestions(room.id) : Promise.resolve(false),
			]);
			return { picked, hasQuestions };
		},
		enabled: !!player?.id,
	});

	const notifications = permission === "granted";
	const players = room.member_count ?? room.members.length;

	const steps: ChecklistStep[] = isHost
		? [
				{ id: "created", done: true },
				{ id: "series", done: seriesOptions.length > 0 },
				{ id: "questions", done: !!checks?.hasQuestions },
				{ id: "players", done: players >= 3 },
				{ id: "notifications", done: notifications },
			]
		: [
				{ id: "joined", done: true },
				{ id: "how_it_works", done: !!preferences?.has_seen_how_to_play },
				{ id: "first_pick", done: !!checks?.picked },
				{ id: "notifications", done: notifications },
			];

	const isLoading = isChecksPending || isSeriesPending || !preferences;
	const doneCount = steps.filter((step) => step.done).length;
	return {
		steps,
		doneCount,
		total: steps.length,
		isComplete: doneCount === steps.length,
		isLoading,
		players,
	};
}
