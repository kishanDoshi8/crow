import type { ShareKind } from "@/shared/lib/referral";

// Short /i/<code> links show the room's name and counts when pasted into a
// chat. They need the /i/ block in deploy/nginx/sites-available/kishandoshi.me, so
// they're used only once VITE_SHORT_INVITE_LINKS=true is set for the build.
const useShortLinks = import.meta.env.VITE_SHORT_INVITE_LINKS === "true";

// A link into the room that remembers which shareable it came from and, for a
// prediction or series, takes a new friend straight there after joining.
export function shareLink(roomCode: string, ref: ShareKind, next?: string) {
	const params = new URLSearchParams({ ref });
	if (next) params.set("next", next);
	const path = useShortLinks ? `/i/${roomCode}` : `/rooms/${roomCode}/join`;
	return `${globalThis.location.origin}${path}?${params.toString()}`;
}

export function shareHost() {
	return globalThis.location.host;
}
