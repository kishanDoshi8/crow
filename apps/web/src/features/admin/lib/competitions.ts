import type { AdminCompetition } from "@/shared/lib/api";

const today = () => new Date().toISOString().slice(0, 10);

// Ended (its last day has passed) or archived by an admin: /admin files it
// under Finished instead of with the current ones.
export function isFinished(competition: Pick<AdminCompetition, "archived_at" | "ends_on">) {
	return !!competition.archived_at || (!!competition.ends_on && competition.ends_on < today());
}
