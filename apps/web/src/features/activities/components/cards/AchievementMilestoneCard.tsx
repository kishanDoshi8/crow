import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";
import {
	ActivityPlayerIdentity,
} from "@/features/activities/components/cards/ActivityPlayerIdentity";
import { formatActivityTimestamp } from "@/features/activities/lib/activity";
import type { AchievementMilestoneActivity } from "@/features/activities/types/types";
import { isMilestoneType } from "@/shared/lib/milestones";
import { getMilestoneVisual } from "@/shared/lib/seriesRecognitionVisuals";

// A player cleared a career milestone (First Title, Century, Moonshot...).
export function AchievementMilestoneCard({
	activity,
}: Readonly<ActivityCardComponentProps<AchievementMilestoneActivity>>) {
	const { member, milestoneType } = activity.metadata;
	if (!isMilestoneType(milestoneType)) return <></>;
	const visual = getMilestoneVisual(milestoneType);

	return (
		<div className='rounded-3xl border border-border/60 bg-card p-4'>
			<div className='flex items-start justify-between gap-3'>
				<ActivityPlayerIdentity
					username={member.username}
					avatarSize='default'
					nameClassName='text-base text-foreground'
				/>
				<span className='shrink-0 text-xs font-medium text-muted-foreground'>
					{formatActivityTimestamp(activity.createdAt)}
				</span>
			</div>
			<div className='mt-3 flex items-center gap-3'>
				<div className='flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40'>
					<visual.Icon className='size-5 text-foreground/80' />
				</div>
				<div className='min-w-0'>
					<p className='text-sm font-semibold text-foreground'>
						Unlocked {visual.label}
					</p>
					<p className='text-xs text-muted-foreground'>{visual.description}</p>
				</div>
			</div>
		</div>
	);
}
