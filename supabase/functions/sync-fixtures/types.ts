// The one shape every provider adapter produces, and what
// public.sync_competition_fixtures takes. Nothing provider-specific goes
// past an adapter except provider_ref.

export type StageKind = "league" | "group" | "knockout" | "final";

export type FixtureStatus =
	| "scheduled"
	| "live"
	| "finished"
	| "postponed"
	| "abandoned"
	| "cancelled";

export type CatalogTeam = {
	provider_ref: string;
	name: string;
	short_name: string;
};

// Football: the score as the provider gives it.
export type FootballResult = {
	winner: "home" | "away" | "draw" | null;
	duration: "regular" | "extra_time" | "penalties";
	full_time: { home: number | null; away: number | null };
	half_time: { home: number | null; away: number | null };
	// Only where the provider gives them separately.
	regular_time?: { home: number | null; away: number | null };
	extra_time?: { home: number | null; away: number | null };
	penalties?: { home: number | null; away: number | null };
};

type Side = "home" | "away";

// Cricket: who won, the toss and each innings, with sides as home or away
// (the fixture's teams in the order the provider lists them).
export type CricketResult = {
	winner: Side | "draw" | "tie" | "no_result" | null;
	toss_winner: Side | null;
	toss_choice: "bat" | "bowl" | null;
	innings: { team: Side | null; runs: number; wickets: number; overs: number }[];
	status_text: string;
	// Read from the match's own page (toss and innings included), not just a
	// series list: once a finished match has this, it's settled.
	detailed?: boolean;
};

export type CatalogResult = FootballResult | CricketResult;

export type CatalogFixture = {
	provider_ref: string;
	kickoff_at: string;
	status: FixtureStatus;
	season: string;
	matchday: number | null;
	// "Matchweek 13", "Quarter-finals"...
	round_label: string | null;
	// The database tells first legs from deciding ones.
	stage_kind: StageKind;
	// Cricket only.
	match_format?: "test" | "odi" | "t20" | null;
	// "1st Test", and where it's played.
	label?: string | null;
	venue?: string | null;
	// Null until a draw decides them.
	home: CatalogTeam | null;
	away: CatalogTeam | null;
	// Set once the match is over.
	result: CatalogResult | null;
};

export type ProviderAdapter = {
	// The competition's whole season (or the matches the provider lists).
	fetchFixtures: (
		competitionRef: string,
	) => Promise<{ season: string; fixtures: CatalogFixture[] }>;
	// Providers whose season list carries no results: fetch these played
	// matches one by one.
	fetchResults?: (
		competitionRef: string,
		matchRefs: string[],
	) => Promise<CatalogFixture[]>;
	// Sync the season list at most this often, unless asked from /admin
	// (call limits). Results are paced by the database instead.
	minHoursBetweenSyncs?: number;
};
