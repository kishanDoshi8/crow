export const SERIES_AWARD_META = {
	LONGEST_STREAK: {
		label: "Longest win streak",
		description: "Longest run of called picks in the series.",
	},
	BIGGEST_PROFIT: {
		label: "Biggest haul",
		description: "Most points won on a single pick.",
	},
	MOST_POINTS_RISKED: {
		label: "Fearless",
		description: "Put the most points on picks this series.",
	},
	EVER_PRESENT: {
		label: "Ever-present",
		description: "Picked every question in the series.",
	},
	SHARPSHOOTER: {
		label: "Sharpshooter",
		description: "Called the highest share of results.",
	},
	UNDERDOG: {
		label: "Underdog",
		description: "Called the longest long shot of the series.",
	},
	COMEBACK: {
		label: "Comeback kid",
		description: "Climbed the most places from their lowest point.",
	},
	HOT_FINISH: {
		label: "Hot finish",
		description: "Called the most results in the final stretch.",
	},
} as const;

export type SeriesAwardType = keyof typeof SERIES_AWARD_META;

const SERIES_AWARD_VALUES = (awardValue: number) => ({
	LONGEST_STREAK: `${awardValue} wins`,
	BIGGEST_PROFIT: `+${awardValue.toLocaleString()} pts`,
	MOST_POINTS_RISKED: `${awardValue.toLocaleString()} pts on picks`,
	EVER_PRESENT: `${awardValue.toLocaleString()} questions`,
	SHARPSHOOTER: `${awardValue}% called`,
	UNDERDOG: `×${awardValue} call`,
	COMEBACK: `up ${awardValue} places`,
	HOT_FINISH: `${awardValue} late wins`,
});

export function getSeriesAwardLabel(awardType: string) {
	if (awardType in SERIES_AWARD_META) {
		const seriesLabel = SERIES_AWARD_META[awardType as SeriesAwardType].label;
		return seriesLabel;
	}

	return awardType;
}

// Award descriptions are saved on each award row when a series closes, in
// older wording. Show the current copy for known awards instead.
export function getSeriesAwardDescription(awardType: string, saved?: string | null) {
	if (awardType in SERIES_AWARD_META) {
		return SERIES_AWARD_META[awardType as SeriesAwardType].description;
	}
	return saved ?? "";
}

export function getSeriesAwardValue(awardType: string, awardValue: number) {
	if (awardType in SERIES_AWARD_VALUES(awardValue)) {
		return SERIES_AWARD_VALUES(awardValue)[awardType as SeriesAwardType];
	}
	return awardValue;
}

export function getSeriesPlacementLabel(placement: number) {
	if (placement === 1) return "Champion";
	if (placement === 2) return "Runner-up";
	if (placement === 3) return "Third place";
	return `#${placement}`;
}
