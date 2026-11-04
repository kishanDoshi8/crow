import { TrophyIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPoints,
	formatPredictionSeries,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { PredictionRevealedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function PredictionRevealedCard({
	activity,
	roomCode,
	showSeries,
}: Readonly<ActivityCardComponentProps<PredictionRevealedActivity>>) {
	const metadata = activity.metadata;
	const winnerLabel = metadata.winningOptionLabel ?? "Winner decided";
	return (
		<ActivityCard
			tier={activity.activityTier}
			actorLabel={activity.createdBy?.username}
			icon={<TrophyIcon className='size-4' />}
			typeLabel='Resolved'
			tone='success'
			title={metadata.title}
			summary={`${winnerLabel} · ${formatPoints(metadata.totalWagered)} pts pool`}
			contextLabel={showSeries ? formatPredictionSeries(metadata) : undefined}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
