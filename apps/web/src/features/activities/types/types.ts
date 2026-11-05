export type ActivityType =
	| "room_joined"
	| "achievement_rating_tier_reached"
	| "achievement_streak_milestone"
	| "achievement_milestone"
	| "prediction_created"
	| "prediction_locked"
	| "prediction_revealed"
	| "prediction_cancelled"
	| "prediction_no_result"
	| "prediction_corrected"
	| "duel_created"
	| "duel_matched"
	| "duel_resolved"
	| "duel_cancelled"
	| "duel_expired";

export type ActivityTier = 1 | 2 | 3;

export type ActivityFilter =
	| "all"
	| "predictions"
	| "duels"
	| "members"
	| "achievements";

export type ActivityClickAction =
	| {
			type: "prediction";
			predictionId: string;
	  }
	| {
			type: "duel";
			predictionId: string;
			duelId: string;
	  };

export type ActivityPlayer = {
	id: string;
	username: string;
};

export type PredictionActivityOptionTotal = {
	optionId: string;
	label: string;
	totalBet: number;
	displayOrder: number;
};

export type PredictionActivityMetadata = {
	predictionId: string;
	title: string;
	seriesId: string | null;
	seriesTitle: string | null;
	seriesPredictionNumber: number | null;
	status: "draft" | "locked" | "revealed" | "cancelled" | "no_result";
	deadline: string;
	resolvedAt: string | null;
	winningOptionId: string | null;
	winningOptionLabel: string | null;
	noResultReason: string | null;
	totalBets: number;
	totalWagered: number;
	optionTotals: PredictionActivityOptionTotal[];
};

export type DuelActivityMetadata = {
	duelId: string;
	predictionId: string;
	predictionTitle: string;
	status: "created" | "queued" | "matched" | "resolved" | "cancelled" | "expired";
	challenger: ActivityPlayer;
	opponent: ActivityPlayer | null;
	winner: ActivityPlayer | null;
	stakeAmount: number;
	payout: number | null;
	createdAt: string;
	matchedAt: string | null;
	resolvedAt: string | null;
};

export type RoomJoinedMetadata = {
	member: ActivityPlayer;
};

export type AchievementRatingTierReachedMetadata = {
	member: ActivityPlayer;
	rating?: number | null;
	reachedTierMinRating?: number | null;
	reachedTierLabel?: string | null;
};

export type AchievementStreakMilestoneMetadata = {
	member: ActivityPlayer;
	streak: number;
	milestone?: number | null;
};

export type AchievementMilestoneMetadata = {
	member: ActivityPlayer;
	milestoneType: string;
	seriesId?: string | null;
};

export type RoomActivityBase<
	TType extends ActivityType,
	TMetadata,
> = {
	id: string;
	activityType: TType;
	activityTier: ActivityTier;
	metadata: TMetadata;
	clickAction: ActivityClickAction | null;
	createdAt: string;
	// Who acted, e.g. the staff member who revealed a result.
	createdBy?: ActivityPlayer | null;
};

export type RoomJoinedActivity = RoomActivityBase<
	"room_joined",
	RoomJoinedMetadata
>;
export type AchievementRatingTierReachedActivity = RoomActivityBase<
	"achievement_rating_tier_reached",
	AchievementRatingTierReachedMetadata
>;
export type AchievementStreakMilestoneActivity = RoomActivityBase<
	"achievement_streak_milestone",
	AchievementStreakMilestoneMetadata
>;

export type AchievementMilestoneActivity = RoomActivityBase<
	"achievement_milestone",
	AchievementMilestoneMetadata
>;

export type PredictionCreatedActivity = RoomActivityBase<
	"prediction_created",
	PredictionActivityMetadata
>;
export type PredictionLockedActivity = RoomActivityBase<
	"prediction_locked",
	PredictionActivityMetadata
>;
export type PredictionRevealedActivity = RoomActivityBase<
	"prediction_revealed",
	PredictionActivityMetadata
>;
export type PredictionCancelledActivity = RoomActivityBase<
	"prediction_cancelled",
	PredictionActivityMetadata
>;
export type PredictionNoResultActivity = RoomActivityBase<
	"prediction_no_result",
	PredictionActivityMetadata
>;
export type PredictionCorrectedActivity = RoomActivityBase<
	"prediction_corrected",
	PredictionActivityMetadata & {
		previousStatus: "revealed" | "no_result";
		previousWinningOptionLabel: string | null;
	}
>;

export type DuelCreatedActivity = RoomActivityBase<
	"duel_created",
	DuelActivityMetadata
>;
export type DuelMatchedActivity = RoomActivityBase<
	"duel_matched",
	DuelActivityMetadata
>;
export type DuelResolvedActivity = RoomActivityBase<
	"duel_resolved",
	DuelActivityMetadata
>;
export type DuelCancelledActivity = RoomActivityBase<
	"duel_cancelled",
	DuelActivityMetadata
>;
export type DuelExpiredActivity = RoomActivityBase<
	"duel_expired",
	DuelActivityMetadata
>;

export type RoomActivity =
	| RoomJoinedActivity
	| AchievementRatingTierReachedActivity
	| AchievementStreakMilestoneActivity
	| AchievementMilestoneActivity
	| PredictionCreatedActivity
	| PredictionLockedActivity
	| PredictionRevealedActivity
	| PredictionCancelledActivity
	| PredictionNoResultActivity
	| PredictionCorrectedActivity
	| DuelCreatedActivity
	| DuelMatchedActivity
	| DuelResolvedActivity
	| DuelCancelledActivity
	| DuelExpiredActivity;

export type RoomActivitiesPage = {
	items: RoomActivity[];
	next_cursor_created_at: string | null;
	next_cursor_id: string | null;
	has_more: boolean;
};
