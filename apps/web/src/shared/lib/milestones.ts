// Career milestones: personal bars a player clears once per room, kept apart
// from series awards (see private.award_milestones).
export const MILESTONE_META = {
	FIRST_TITLE: {
		label: "First title",
		description: "Won a series for the first time.",
	},
	HAT_TRICK: { label: "Hat-trick", description: "Won three series." },
	BACK_TO_BACK: {
		label: "Back-to-back",
		description: "Won two series in a row.",
	},
	CENTURY: { label: "Century", description: "Made 100 picks." },
	MOONSHOT: {
		label: "Moonshot",
		description: "Called a 10× long shot.",
	},
	IRON_SEASON: {
		label: "Iron season",
		description: "Picked every question in a 10+ question series.",
	},
} as const;

export type MilestoneType = keyof typeof MILESTONE_META;

export function isMilestoneType(value: string): value is MilestoneType {
	return value in MILESTONE_META;
}
