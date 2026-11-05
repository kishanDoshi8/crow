import { PencilLineIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPredictionSeries,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { PredictionCorrectedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

// "Result corrected: now Away (was Home)". Points moved for everyone who bet,
// so the feed says what changed and who changed it.
export function PredictionCorrectedCard({
	activity,
	roomCode,
	showSeries,
}: Readonly<ActivityCardComponentProps<PredictionCorrectedActivity>>) {
	const metadata = activity.metadata;
	const now =
		metadata.status === "revealed" && metadata.winningOptionLabel
			? metadata.winningOptionLabel
			: "No result";
	const was =
		metadata.previousStatus === "revealed" &&
		metadata.previousWinningOptionLabel
			? metadata.previousWinningOptionLabel
			: "No result";

	return (
		<ActivityCard
			tier={activity.activityTier}
			actorLabel={activity.createdBy?.username}
			icon={<PencilLineIcon className='size-4' />}
			typeLabel='Result corrected'
			tone='warning'
			title={metadata.title}
			summary={`Now ${now} (was ${was}). Points are updated.`}
			contextLabel={showSeries ? formatPredictionSeries(metadata) : undefined}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
