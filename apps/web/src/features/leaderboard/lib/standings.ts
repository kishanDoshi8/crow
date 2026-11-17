import type { LeaderboardEntry } from "@/features/leaderboard/types/types";

export type RankedEntry = LeaderboardEntry & { rank: number };

// Players short of the series' minimum bets aren't ranked; they're listed apart.
export function splitStandings(entries: LeaderboardEntry[]) {
	const ranked: RankedEntry[] = [];
	const unranked: LeaderboardEntry[] = [];
	for (const entry of entries) {
		if (entry.is_ranked && entry.rank !== null) ranked.push({ ...entry, rank: entry.rank });
		else unranked.push(entry);
	}
	return { ranked, unranked };
}

// "needs 1 more pick", "needs 2 more picks".
export function betsNeededLabel(betsNeeded: number) {
	return `needs ${betsNeeded} more ${betsNeeded === 1 ? "pick" : "picks"}`;
}

// "Make 3 picks on questions with results to be ranked."
export function rankingRuleLabel(requiredBets: number) {
	return `Make ${requiredBets} ${requiredBets === 1 ? "pick" : "picks"} on questions with results to be ranked.`;
}
