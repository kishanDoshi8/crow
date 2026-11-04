import { BanIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPredictionSeries,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { PredictionCancelledActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function PredictionCancelledCard({
	activity,
	roomCode,
	showSeries,
}: Readonly<ActivityCardComponentProps<PredictionCancelledActivity>>) {
	const metadata = activity.metadata;
	return (
		<ActivityCard
			tier={activity.activityTier}
			actorLabel={activity.createdBy?.username}
			icon={<BanIcon className='size-4' />}
			typeLabel='Cancelled'
			tone='danger'
			title={metadata.title}
			summary={metadata.noResultReason ?? "All bets were refunded."}
			contextLabel={showSeries ? formatPredictionSeries(metadata) : undefined}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
