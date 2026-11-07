export const SERIES_AWARD_META = {
	LONGEST_STREAK: { label: "Longest Win Streak" },
	BIGGEST_PROFIT: { label: "Biggest Profit" },
	MOST_POINTS_RISKED: { label: "High Roller" },
	EVER_PRESENT: { label: "Ever-Present" },
	SHARPSHOOTER: { label: "Sharpshooter" },
	UNDERDOG: { label: "Underdog" },
	COMEBACK: { label: "Comeback Kid" },
	HOT_FINISH: { label: "Hot Finish" },
} as const;

export type SeriesAwardType = keyof typeof SERIES_AWARD_META;

const SERIES_AWARD_VALUES = (awardValue: number) => ({
	LONGEST_STREAK: `${awardValue} wins`,
	BIGGEST_PROFIT: `+${awardValue.toLocaleString()} pts`,
	MOST_POINTS_RISKED: `${awardValue.toLocaleString()} risked`,
	EVER_PRESENT: `${awardValue.toLocaleString()} games`,
	SHARPSHOOTER: `${awardValue}% called`,
	UNDERDOG: `won at ${awardValue}×`,
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

export function getSeriesAwardValue(awardType: string, awardValue: number) {
	if (awardType in SERIES_AWARD_VALUES(awardValue)) {
		return SERIES_AWARD_VALUES(awardValue)[awardType as SeriesAwardType];
	}
	return awardValue;
}

export function getSeriesPlacementLabel(placement: number) {
	if (placement === 1) return "Champion";
	if (placement === 2) return "Runner-up";
	if (placement === 3) return "Third Place";
	return `#${placement}`;
}
