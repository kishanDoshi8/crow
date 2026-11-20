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

export type CatalogResult = {
	winner: "home" | "away" | "draw" | null;
	duration: "regular" | "extra_time" | "penalties";
	full_time: { home: number | null; away: number | null };
	half_time: { home: number | null; away: number | null };
	// Only where the provider gives them separately.
	regular_time?: { home: number | null; away: number | null };
	extra_time?: { home: number | null; away: number | null };
	penalties?: { home: number | null; away: number | null };
};

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
	// Null until a draw decides them.
	home: CatalogTeam | null;
	away: CatalogTeam | null;
	// Set once the match is over.
	result: CatalogResult | null;
};

export type ProviderAdapter = {
	fetchFixtures: (
		competitionRef: string,
	) => Promise<{ season: string; fixtures: CatalogFixture[] }>;
};
