import type { AdminResultFixture } from "@/shared/lib/api";

// A played match an admin can confirm now: it has a score, or it didn't
// finish (then every answer is No result). The rest wait for the feed.
export const isReady = (fixture: AdminResultFixture) =>
	fixture.result !== null || ["postponed", "abandoned", "cancelled"].includes(fixture.status);
