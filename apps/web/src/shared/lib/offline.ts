import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

// With no connection the app is read-only: it shows what's saved on the
// device, and actions (bets, reactions, settings…) wait until it's back.
// Queries already pause offline; every mutation is stopped here before it
// starts (see AppProviders), so nothing is queued to go out later.

// TanStack Query assumes it starts online and only hears later changes, so an
// app opened with no connection would think it's online. A false
// navigator.onLine is reliable (a true one can be optimistic), so start from it.
if (typeof navigator !== "undefined" && navigator.onLine === false) {
	onlineManager.setOnline(false);
}

export const OFFLINE_MESSAGE = "You're offline. Try again once you're back online.";

export class OfflineError extends Error {
	constructor() {
		super(OFFLINE_MESSAGE);
		this.name = "OfflineError";
	}
}

export function isOnline() {
	return onlineManager.isOnline();
}

// Whether the device has a connection right now; re-renders when it changes.
export function useOnline() {
	return useSyncExternalStore(
		(listener) => onlineManager.subscribe(listener),
		isOnline,
		() => true,
	);
}
