import { kickoffTime } from "@/features/fixtures/lib/grouping";
import type { RoomCompetition } from "@/shared/lib/api";

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

// "Next: Arsenal vs Chelsea, Sat 15:00"
export function nextLine(competition: RoomCompetition) {
	if (!competition.next) return "No matches coming up";
	const kickoff = new Date(competition.next.kickoff_at);
	const soon = kickoff.getTime() - Date.now() < 6 * 86_400_000;
	return `Next: ${competition.next.home} vs ${competition.next.away}, ${
		soon ? weekday.format(kickoff) : shortDate.format(kickoff)
	} ${kickoffTime(competition.next.kickoff_at)}`;
}

export function weekLine(competition: RoomCompetition) {
	if (competition.week_matches === 0) return "No matches this week";
	const matches = `${competition.week_matches} ${competition.week_matches === 1 ? "match" : "matches"} this week`;
	return competition.week_added > 0 ? `${matches}, ${competition.week_added} added` : matches;
}
