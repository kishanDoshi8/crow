import { LockIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPoints,
	formatPredictionSeries,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { PredictionLockedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function PredictionLockedCard({
	activity,
	roomCode,
	showSeries,
}: Readonly<ActivityCardComponentProps<PredictionLockedActivity>>) {
	const metadata = activity.metadata;
	return (
		<ActivityCard
			tier={activity.activityTier}
			icon={<LockIcon className='size-4' />}
			typeLabel='Locked'
			tone='warning'
			title={metadata.title}
			summary={`${metadata.totalBets} bets · ${formatPoints(metadata.totalWagered)} pts wagered`}
			contextLabel={showSeries ? formatPredictionSeries(metadata) : undefined}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
