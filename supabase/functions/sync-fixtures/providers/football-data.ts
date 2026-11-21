// football-data.org v4 (https://www.football-data.org/documentation/api).
// Free tier: 10 calls a minute, delayed scores; one call per competition
// returns its whole current season. Key: FOOTBALL_DATA_API_KEY.
import type {
	CatalogFixture,
	CatalogResult,
	CatalogTeam,
	FixtureStatus,
	ProviderAdapter,
	StageKind,
} from "../types.ts";

const API = "https://api.football-data.org/v4";

type Score = { home: number | null; away: number | null };

type Team = {
	id: number | null;
	name: string | null;
	shortName: string | null;
	tla: string | null;
};

type Match = {
	id: number;
	utcDate: string;
	status: string;
	matchday: number | null;
	stage: string;
	season: { startDate: string; endDate: string };
	homeTeam: Team;
	awayTeam: Team;
	score: {
		winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
		duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
		fullTime: Score;
		halfTime: Score;
		regularTime?: Score;
		extraTime?: Score;
		penalties?: Score;
	};
};

const STATUS: Record<string, FixtureStatus> = {
	SCHEDULED: "scheduled",
	TIMED: "scheduled",
	IN_PLAY: "live",
	PAUSED: "live",
	LIVE: "live",
	FINISHED: "finished",
	AWARDED: "finished",
	POSTPONED: "postponed",
	SUSPENDED: "abandoned",
	CANCELLED: "cancelled",
};

const ROUNDS: Record<string, string> = {
	PLAYOFFS: "Knockout play-offs",
	PLAYOFF_ROUND: "Knockout play-offs",
	LAST_32: "Round of 32",
	LAST_16: "Round of 16",
	QUARTER_FINALS: "Quarter-finals",
	SEMI_FINALS: "Semi-finals",
	THIRD_PLACE: "Third place play-off",
	FINAL: "Final",
};

// "2026-08-15" and "2027-05-23" → "2026/27"; a calendar-year season → "2026".
export function seasonLabel(startDate: string, endDate: string) {
	const start = startDate.slice(0, 4);
	const end = endDate.slice(0, 4);
	return start === end ? start : `${start}/${end.slice(2)}`;
}

function stageKind(stage: string): StageKind {
	if (stage === "REGULAR_SEASON" || stage === "LEAGUE_STAGE") return "league";
	if (stage === "GROUP_STAGE") return "group";
	if (stage === "FINAL") return "final";
	return "knockout";
}

function roundLabel(stage: string, matchday: number | null) {
	if (stage === "REGULAR_SEASON") {
		return matchday ? `Matchweek ${matchday}` : null;
	}
	if (stage === "LEAGUE_STAGE" || stage === "GROUP_STAGE") {
		return matchday ? `Matchday ${matchday}` : null;
	}
	// QUALIFICATION_ROUND_2 → "Qualification round 2"
	return (
		ROUNDS[stage] ??
		stage.charAt(0) + stage.slice(1).toLowerCase().replaceAll("_", " ")
	);
}

function team(value: Team): CatalogTeam | null {
	if (value.id === null || !value.name) return null;
	return {
		provider_ref: String(value.id),
		name: value.name,
		short_name: value.shortName || value.name,
	};
}

function result(match: Match, status: FixtureStatus): CatalogResult | null {
	if (status !== "finished") return null;
	const { score } = match;
	return {
		winner:
			score.winner === "HOME_TEAM"
				? "home"
				: score.winner === "AWAY_TEAM"
					? "away"
					: score.winner === "DRAW"
						? "draw"
						: null,
		duration:
			score.duration === "EXTRA_TIME"
				? "extra_time"
				: score.duration === "PENALTY_SHOOTOUT"
					? "penalties"
					: "regular",
		full_time: score.fullTime,
		half_time: score.halfTime,
		...(score.regularTime ? { regular_time: score.regularTime } : {}),
		...(score.extraTime ? { extra_time: score.extraTime } : {}),
		...(score.penalties ? { penalties: score.penalties } : {}),
	};
}

export function toCatalogFixture(match: Match): CatalogFixture {
	const status = STATUS[match.status] ?? "scheduled";
	return {
		provider_ref: String(match.id),
		kickoff_at: match.utcDate,
		status,
		season: seasonLabel(match.season.startDate, match.season.endDate),
		matchday: match.matchday,
		round_label: roundLabel(match.stage, match.matchday),
		stage_kind: stageKind(match.stage),
		home: team(match.homeTeam),
		away: team(match.awayTeam),
		result: result(match, status),
	};
}

export const footballData: ProviderAdapter = {
	async fetchFixtures(competitionRef) {
		const key = Deno.env.get("FOOTBALL_DATA_API_KEY");
		if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");

		// No season filter: the competition's current season.
		const response = await fetch(
			`${API}/competitions/${encodeURIComponent(competitionRef)}/matches`,
			{ headers: { "X-Auth-Token": key } },
		);
		if (!response.ok) {
			throw new Error(
				`football-data.org ${competitionRef}: ${response.status} ${await response.text()}`,
			);
		}

		const body = (await response.json()) as { matches: Match[] };
		const fixtures = body.matches.map(toCatalogFixture);
		const first = body.matches[0];
		return {
			season: first
				? seasonLabel(first.season.startDate, first.season.endDate)
				: "",
			fixtures,
		};
	},
};
