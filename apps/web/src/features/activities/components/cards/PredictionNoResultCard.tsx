import { MinusCircleIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPredictionSeries,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { PredictionNoResultActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function PredictionNoResultCard({
	activity,
	roomCode,
	showSeries,
}: Readonly<ActivityCardComponentProps<PredictionNoResultActivity>>) {
	const metadata = activity.metadata;
	return (
		<ActivityCard
			tier={activity.activityTier}
			actorLabel={activity.createdBy?.username}
			icon={<MinusCircleIcon className='size-4' />}
			typeLabel='No result'
			tone='warning'
			title={metadata.title}
			summary={metadata.noResultReason ?? "All bets were refunded."}
			contextLabel={showSeries ? formatPredictionSeries(metadata) : undefined}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
