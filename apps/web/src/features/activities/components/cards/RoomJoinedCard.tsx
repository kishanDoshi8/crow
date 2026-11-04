import { UserPlusIcon } from "lucide-react";
import {
	ActivityPlayerIdentity,
} from "@/features/activities/components/cards/ActivityPlayerIdentity";
import { formatActivityTimestamp } from "@/features/activities/lib/activity";
import type { RoomJoinedActivity } from "@/features/activities/types/types";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";

export function RoomJoinedCard({
	activity,
}: Readonly<ActivityCardComponentProps<RoomJoinedActivity>>) {
	return (
		<div className='rounded-2xl border border-border/70 bg-card/70 px-4 py-3'>
			<div className='flex items-start justify-between gap-3'>
				<div className='flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground'>
					<UserPlusIcon className='size-3.5 text-activity' />
					New member
				</div>
				<span className='shrink-0 text-xs font-medium text-muted-foreground'>
					{formatActivityTimestamp(activity.createdAt)}
				</span>
			</div>
			<div className='mt-2.5 flex items-center justify-between gap-3'>
				<ActivityPlayerIdentity
					username={activity.metadata.member.username}
					avatarSize='sm'
					nameClassName='text-sm text-foreground'
				/>
				<p className='shrink-0 text-sm font-semibold text-foreground'>
					👋 Welcome
				</p>
			</div>
			<p className='mt-1 text-sm text-muted-foreground'>Joined the room.</p>
		</div>
	);
}
