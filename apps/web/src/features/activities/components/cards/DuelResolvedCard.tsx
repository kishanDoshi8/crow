import { CrownIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPoints,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { DuelResolvedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function DuelResolvedCard({
	activity,
	roomCode,
}: Readonly<ActivityCardComponentProps<DuelResolvedActivity>>) {
	const metadata = activity.metadata;
	const winnerLabel = metadata.winner
		? `${metadata.winner.username} won`
		: "Duel settled";
	return (
		<ActivityCard
			tier={activity.activityTier}
			icon={<CrownIcon className='size-4' />}
			typeLabel='Duel resolved'
			tone='success'
			actorLabel={
				metadata.winner?.username ?? metadata.challenger.username
			}
			title='Duel resolved'
			description={winnerLabel}
			summary={
				metadata.payout
					? `${formatPoints(metadata.payout)} pts payout`
					: `${formatPoints(metadata.stakeAmount)} pts stake`
			}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
