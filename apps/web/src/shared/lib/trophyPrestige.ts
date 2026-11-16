import {
	getSeriesAwardValue,
	type SeriesAwardType,
} from "@/shared/lib/seriesRewards";
import { formatSignedPoints } from "@/shared/lib/utils";

// How much a series' trophies are worth, from how big the series was. The
// server sets it when a series completes (private.series_tier); the weights
// that turn tiers into an order live here.
export type SeriesTier = "major" | "standard" | "minor";

// How impressive an award was for its series (private.series_award_tier).
export type AwardTier = "gold" | "silver" | "bronze";

const TIER_WEIGHT: Record<SeriesTier, number> = {
	major: 3,
	standard: 2,
	minor: 1,
};

const PLACEMENT_WEIGHT: Record<number, number> = { 1: 10, 2: 6, 3: 4 };
// A gold award ranks level with a third-place finish.
const AWARD_WEIGHT: Record<AwardTier, number> = { gold: 4, silver: 3, bronze: 2 };

export const SERIES_TIER_ORDER: SeriesTier[] = ["major", "standard", "minor"];

export const AWARD_TIER_LABEL: Record<AwardTier, string> = {
	gold: "Gold",
	silver: "Silver",
	bronze: "Bronze",
};

export type Trophy = {
	id: string;
	seriesId: string;
	seriesTitle: string;
	tier: SeriesTier;
	score: number;
	// When the trophy was won, for recency tie-breaks and the cabinet.
	wonAt: string;
} & (
	| { kind: "placement"; placement: number; points: number }
	| {
			kind: "award";
			awardType: SeriesAwardType;
			awardTier: AwardTier;
			value: number;
	  }
);

type ChampionshipRow = {
	id: string;
	series_id: string;
	series_title: string;
	series_tier: SeriesTier | null;
	series_completed_at: string | null;
	placement: number;
	points: number;
	created_at: string;
};

type AwardRow = {
	id: string;
	series_id: string;
	series_title: string;
	series_tier: SeriesTier | null;
	series_completed_at: string | null;
	award_type: SeriesAwardType;
	award_tier: AwardTier | null;
	value: number;
	created_at: string;
};

// Every trophy a player holds, most prestigious first.
export function buildTrophies(
	championships: ChampionshipRow[],
	awards: AwardRow[],
): Trophy[] {
	const trophies: Trophy[] = [
		...championships.map((row): Trophy => {
			const tier = row.series_tier ?? "standard";
			return {
				id: row.id,
				kind: "placement",
				placement: row.placement,
				points: row.points,
				seriesId: row.series_id,
				seriesTitle: row.series_title,
				tier,
				score: TIER_WEIGHT[tier] * (PLACEMENT_WEIGHT[row.placement] ?? 1),
				wonAt: row.series_completed_at ?? row.created_at,
			};
		}),
		...awards.map((row): Trophy => {
			const tier = row.series_tier ?? "standard";
			const awardTier = row.award_tier ?? "bronze";
			return {
				id: row.id,
				kind: "award",
				awardType: row.award_type,
				awardTier,
				value: row.value,
				seriesId: row.series_id,
				seriesTitle: row.series_title,
				tier,
				score: TIER_WEIGHT[tier] * AWARD_WEIGHT[awardTier],
				wonAt: row.series_completed_at ?? row.created_at,
			};
		}),
	];

	return trophies.sort(
		(a, b) => b.score - a.score || b.wonAt.localeCompare(a.wonAt),
	);
}

// Titles for how someone plays, held right now (public.get_room_member_style).
export type StyleTitle = "SHARPSHOOTER" | "GIANT_KILLER" | "HIGH_ROLLER" | "EVER_PRESENT";

// Highest first: the card shows the first one a player holds.
export const STYLE_TITLE_ORDER: StyleTitle[] = [
	"SHARPSHOOTER",
	"GIANT_KILLER",
	"HIGH_ROLLER",
	"EVER_PRESENT",
];

export const STYLE_TITLE_LABEL: Record<StyleTitle, string> = {
	SHARPSHOOTER: "Sharpshooter",
	GIANT_KILLER: "Giant killer",
	HIGH_ROLLER: "Fearless",
	EVER_PRESENT: "Ever-present",
};

export type IdentityTitle = {
	label: string;
	tone: "champion" | "podium" | "style" | "rookie";
	style?: StyleTitle;
};

const ROOKIE_MAX_PREDICTIONS = 10;
const PODIUM_FINISHER_MIN = 3;

// A one-glance read of who this player is in the room. First match wins;
// a player with nothing that stands out yet has no title.
export function getIdentityTitle({
	trophies,
	styleTitles,
	totalPredictions,
	latestCompletedSeriesId,
}: {
	trophies: Trophy[];
	styleTitles: StyleTitle[];
	totalPredictions: number;
	latestCompletedSeriesId: string | null;
}): IdentityTitle | null {
	const placements = trophies.filter((t) => t.kind === "placement");
	const titles = placements.filter((t) => t.placement === 1);

	if (
		latestCompletedSeriesId &&
		titles.some((t) => t.seriesId === latestCompletedSeriesId)
	) {
		return { label: "Reigning champion", tone: "champion" };
	}
	if (titles.length >= 2) {
		return { label: `${titles.length}× champion`, tone: "champion" };
	}
	if (titles.length === 1) return { label: "Champion", tone: "champion" };
	if (placements.length >= PODIUM_FINISHER_MIN) {
		return { label: "Podium finisher", tone: "podium" };
	}
	const style = STYLE_TITLE_ORDER.find((title) => styleTitles.includes(title));
	if (style) {
		return { label: STYLE_TITLE_LABEL[style], tone: "style", style };
	}
	if (totalPredictions < ROOKIE_MAX_PREDICTIONS) {
		return { label: "Rookie", tone: "rookie" };
	}
	return null;
}

// What the trophy was won with: net points for a placement, the feat for an award.
export function formatTrophyValue(trophy: Trophy): string {
	if (trophy.kind === "placement") {
		return `${formatSignedPoints(Math.round(trophy.points))} pts`;
	}
	return String(getSeriesAwardValue(trophy.awardType, trophy.value));
}

export function formatTrophyDate(wonAt: string): string {
	return new Date(wonAt).toLocaleDateString(undefined, {
		month: "short",
		year: "numeric",
	});
}
