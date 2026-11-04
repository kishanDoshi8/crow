import { SparklesIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPredictionSeries,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { PredictionCreatedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function PredictionCreatedCard({
	activity,
	roomCode,
	showSeries,
}: Readonly<ActivityCardComponentProps<PredictionCreatedActivity>>) {
	const metadata = activity.metadata;
	return (
		<ActivityCard
			tier={activity.activityTier}
			icon={<SparklesIcon className='size-4' />}
			typeLabel='Created'
			tone='prediction'
			title={metadata.title}
			contextLabel={showSeries ? formatPredictionSeries(metadata) : undefined}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
