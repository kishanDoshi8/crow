import type { CricketFixtureResult } from "@/shared/lib/api";

// A cricket result as a scoreboard: each side's innings in batting order
// ("312 & 245/6"), the outcome in words and the toss. Used by /admin now,
// and meant for showing a match's result next to a question's outcome
// (get_prediction_match_result).

export type CricketScoreRow = {
	team: string;
	// "72/3", "66 all out", or both of a Test side's innings: "312 & 245/6".
	score: string;
	// The last innings' overs: "10.2 ov".
	overs: string | null;
	won: boolean;
};

const inningScore = (inning: { runs: number; wickets: number }) =>
	inning.wickets >= 10 ? `${inning.runs} all out` : `${inning.runs}/${inning.wickets}`;

// The feed's words, tidied: "won by 7 wkts" → "won by 7 wickets".
export function tidyCricketStatus(text: string) {
	return text
		.replace(/\b1 wkts?\b/gi, "1 wicket")
		.replace(/\bwkts?\b/gi, "wickets")
		.replace(/\b1 runs\b/gi, "1 run")
		.replace(/\s+/g, " ")
		.trim();
}

export function cricketScoreboard(result: CricketFixtureResult, home: string, away: string) {
	const name = (side: "home" | "away" | null) => (side === "home" ? home : side === "away" ? away : null);

	// Sides in the order they first batted.
	const order: ("home" | "away")[] = [];
	for (const inning of result.innings) {
		if (inning.team && !order.includes(inning.team)) order.push(inning.team);
	}
	const rows: CricketScoreRow[] = order.map((side) => {
		const innings = result.innings.filter((inning) => inning.team === side);
		const last = innings.at(-1);
		return {
			team: name(side) ?? "",
			score: innings.map(inningScore).join(" & "),
			overs: last ? `${last.overs} ov` : null,
			won: result.winner === side,
		};
	});

	const outcome =
		result.winner === "no_result"
			? "No result"
			: result.winner === "draw"
				? "Match drawn"
				: result.status_text
					? tidyCricketStatus(result.status_text)
					: null;
	const toss = result.toss_winner
		? `${name(result.toss_winner)} won the toss${result.toss_choice ? ` and chose to ${result.toss_choice}` : ""}`
		: null;

	return { rows, outcome, toss };
}
