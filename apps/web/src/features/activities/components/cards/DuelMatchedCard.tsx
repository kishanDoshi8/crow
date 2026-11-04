import { HandshakeIcon } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import {
	formatActivityTimestamp,
	formatPoints,
	resolveActivityHref,
} from "@/features/activities/lib/activity";
import type { DuelMatchedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function DuelMatchedCard({
	activity,
	roomCode,
}: Readonly<ActivityCardComponentProps<DuelMatchedActivity>>) {
	const metadata = activity.metadata;
	const matchup = metadata.opponent
		? `${metadata.challenger.username} vs ${metadata.opponent.username}`
		: `${metadata.challenger.username} got matched`;

	return (
		<ActivityCard
			tier={activity.activityTier}
			icon={<HandshakeIcon className='size-4' />}
			typeLabel='Duel matched'
			tone='duel'
			actorLabel={metadata.challenger.username}
			title='Duel matched'
			description={matchup}
			summary={`${formatPoints(metadata.stakeAmount)} pts each`}
			timestamp={formatActivityTimestamp(activity.createdAt)}
			href={resolveActivityHref(activity, roomCode)}
		/>
	);
}
