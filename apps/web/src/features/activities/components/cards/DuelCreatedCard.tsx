import { SwordsIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPoints,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { DuelCreatedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function DuelCreatedCard({
	activity,
	roomCode,
}: Readonly<ActivityCardComponentProps<DuelCreatedActivity>>) {
	const metadata = activity.metadata;
	return (
		<ActivityCard
			tier={activity.activityTier}
			icon={<SwordsIcon className='size-4' />}
			typeLabel='Duel created'
			tone='duel'
			actorLabel={metadata.challenger.username}
			title='Duel created'
			description={`${metadata.challenger.username} opened a duel on ${metadata.predictionTitle}`}
			summary={`${formatPoints(metadata.stakeAmount)} pts stake`}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
