import type {
	CricketFixtureResult,
	FixtureResult,
	PredictionMatchResult,
} from "@/shared/lib/api";
import { cricketScoreboard, tidyCricketStatus } from "@/shared/lib/cricketScore";

// How a match a question came from ended, in the words players read next to
// the question's result (MatchResultCard) and on the shared result card.

type Side = "home" | "away";

export type MatchSummary = {
	// Each side's line, home first as in the title: a football score ("2"),
	// or a cricket total with overs ("182/6", "20 ov").
	sides: Array<{ side: Side; name: string; score: string; detail: string | null; won: boolean }>;
	// What else happened, one fact a line: half time, extra time, the
	// shootout, the toss.
	notes: string[];
	// The result in words where the score alone doesn't say it: "India won
	// by 22 runs", "Match abandoned".
	outcome: string | null;
	// One line for the shared card: "ARS 2–1 CHE", "India won by 22 runs".
	shareLine: string | null;
};

const CALLED_OFF: Record<string, string> = {
	postponed: "Match postponed",
	abandoned: "Match abandoned",
	cancelled: "Match called off",
};

const goals = (score: { home: number | null; away: number | null } | undefined) =>
	score && score.home !== null && score.away !== null ? score : null;

export function summarizeMatch(match: PredictionMatchResult): MatchSummary | null {
	const homeName = match.home_name ?? match.home;
	const awayName = match.away_name ?? match.away;

	if (CALLED_OFF[match.status]) {
		return { sides: [], notes: [], outcome: CALLED_OFF[match.status], shareLine: CALLED_OFF[match.status] };
	}
	if (!match.result) return null;

	if (match.sport === "cricket") {
		const result = match.result as CricketFixtureResult;
		const board = cricketScoreboard(result, homeName, awayName);
		const line = board.line;
		const sides = (["home", "away"] as const)
			.filter((side) => line[side])
			.map((side) => ({
				side,
				name: side === "home" ? homeName : awayName,
				score: line[side]!.score,
				detail: `${line[side]!.overs} ov`,
				won: result.winner === side,
			}));
		const outcome =
			board.outcome ?? (result.status_text ? tidyCricketStatus(result.status_text) : null);
		return {
			sides,
			notes: board.toss ? [board.toss] : [],
			outcome,
			shareLine:
				outcome ??
				(line.home && line.away
					? `${match.home} ${line.home.score} – ${line.away.score} ${match.away}`
					: null),
		};
	}

	const result = match.result as FixtureResult;
	const final = goals(result.full_time);
	if (!final) return null;

	const notes: string[] = [];
	const half = goals(result.half_time);
	if (half) notes.push(`Half time ${half.home}–${half.away}`);
	if (result.duration !== "regular") {
		const ninety = goals(result.regular_time);
		notes.push(ninety ? `After extra time (90 minutes ${ninety.home}–${ninety.away})` : "After extra time");
	}
	const pens = result.duration === "penalties" ? goals(result.penalties) : null;
	const pensWinner =
		pens && pens.home !== pens.away ? (pens.home! > pens.away! ? homeName : awayName) : null;
	if (pens) {
		notes.push(
			pensWinner
				? `${pensWinner} win ${Math.max(pens.home!, pens.away!)}–${Math.min(pens.home!, pens.away!)} on penalties`
				: `Penalties ${pens.home}–${pens.away}`,
		);
	}

	return {
		sides: [
			{ side: "home", name: homeName, score: String(final.home), detail: null, won: result.winner === "home" },
			{ side: "away", name: awayName, score: String(final.away), detail: null, won: result.winner === "away" },
		],
		notes,
		outcome: null,
		shareLine: `${match.home} ${final.home}–${final.away} ${match.away}${
			pens ? ` (${pens.home}–${pens.away} pens)` : result.duration === "extra_time" ? " (aet)" : ""
		}`,
	};
}
