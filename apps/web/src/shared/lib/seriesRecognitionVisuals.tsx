import type { LucideIcon } from "lucide-react";
import {
	ArrowUpFromLine,
	CalendarCheck,
	CalendarRange,
	Hash,
	Repeat,
	Coins,
	Crosshair,
	Crown,
	Flame,
	Medal,
	Rocket,
	Sparkles,
	Trophy as TrophyIcon,
	TrendingUp,
	Zap,
} from "lucide-react";
import {
	getSeriesAwardLabel,
	type SeriesAwardType,
} from "@/shared/lib/seriesRewards";
import type { SeriesTier, Trophy } from "@/shared/lib/trophyPrestige";
import { MILESTONE_META, type MilestoneType } from "@/shared/lib/milestones";

type ChampionshipPlacement = 1 | 2 | 3;

type RecognitionVisual = {
	Icon: LucideIcon;
	textClassName: string;
	ringClassName: string;
};

type ChampionshipVisual = RecognitionVisual & {
	tierLabel: string;
};

const championshipVisualMap: Record<ChampionshipPlacement, ChampionshipVisual> =
	{
		1: {
			Icon: Crown,
			tierLabel: "Champion",
			textClassName: "text-rank-1",
			ringClassName: "border-rank-1/40 bg-rank-1/10",
		},
		2: {
			Icon: Medal,
			tierLabel: "Runner-up",
			textClassName: "text-rank-2",
			ringClassName: "border-rank-2/40 bg-rank-2/10",
		},
		3: {
			Icon: Medal,
			tierLabel: "Third",
			textClassName: "text-rank-3",
			ringClassName: "border-rank-3/40 bg-rank-3/10",
		},
	};

const awardVisualMap: Record<SeriesAwardType, RecognitionVisual> = {
	LONGEST_STREAK: {
		Icon: Flame,
		textClassName: "text-hot",
		ringClassName: "border-hot/30 bg-hot/10",
	},
	BIGGEST_PROFIT: {
		Icon: TrendingUp,
		textClassName: "text-win",
		ringClassName: "border-win/30 bg-win/10",
	},
	EVER_PRESENT: {
		Icon: CalendarCheck,
		textClassName: "text-activity",
		ringClassName: "border-activity/30 bg-activity/10",
	},
	MOST_POINTS_RISKED: {
		Icon: Coins,
		textClassName: "text-accent",
		ringClassName: "border-accent/30 bg-accent/10",
	},
	SHARPSHOOTER: {
		Icon: Crosshair,
		textClassName: "text-primary",
		ringClassName: "border-primary/30 bg-primary/10",
	},
	UNDERDOG: {
		Icon: Rocket,
		textClassName: "text-accent",
		ringClassName: "border-accent/30 bg-accent/10",
	},
	COMEBACK: {
		Icon: ArrowUpFromLine,
		textClassName: "text-win",
		ringClassName: "border-win/30 bg-win/10",
	},
	HOT_FINISH: {
		Icon: Zap,
		textClassName: "text-hot",
		ringClassName: "border-hot/30 bg-hot/10",
	},
};

const fallbackChampionshipVisual: ChampionshipVisual = {
	Icon: Medal,
	tierLabel: "Placement",
	textClassName: "text-muted-foreground",
	ringClassName: "border-border/40 bg-secondary/40",
};

const fallbackAwardVisual: RecognitionVisual = {
	Icon: Medal,
	textClassName: "text-muted-foreground",
	ringClassName: "border-border/30 bg-secondary/40",
};

export function getChampionshipVisual(placement: number): ChampionshipVisual {
	if (placement === 1 || placement === 2 || placement === 3) {
		return championshipVisualMap[placement];
	}

	return fallbackChampionshipVisual;
}

export function getAwardVisual(awardType: SeriesAwardType): RecognitionVisual {
	return awardVisualMap[awardType] ?? fallbackAwardVisual;
}

// Major trophies get a podium-gold edge; the rest stay neutral.
export function getTierTileClassName(tier: SeriesTier): string {
	return tier === "major"
		? "border-rank-1/40 shadow-[0_0_24px] shadow-rank-1/10"
		: "border-border/60";
}

// Icon, colors and name for any trophy, placement or award.
export function getTrophyVisual(trophy: Trophy): RecognitionVisual & {
	label: string;
} {
	if (trophy.kind === "placement") {
		const visual = getChampionshipVisual(trophy.placement);
		return { ...visual, label: visual.tierLabel };
	}
	return {
		...getAwardVisual(trophy.awardType),
		label: getSeriesAwardLabel(trophy.awardType),
	};
}

// Milestones sit apart from trophies, so they share one quiet look and differ by icon.
const milestoneIconMap: Record<MilestoneType, LucideIcon> = {
	FIRST_TITLE: Sparkles,
	HAT_TRICK: TrophyIcon,
	BACK_TO_BACK: Repeat,
	CENTURY: Hash,
	MOONSHOT: Rocket,
	IRON_SEASON: CalendarRange,
};

export function getMilestoneVisual(type: MilestoneType) {
	return {
		Icon: milestoneIconMap[type],
		label: MILESTONE_META[type].label,
		description: MILESTONE_META[type].description,
	};
}

