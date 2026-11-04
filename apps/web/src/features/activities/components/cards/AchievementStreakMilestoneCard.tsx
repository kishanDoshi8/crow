import { FlameIcon } from "lucide-react";
import type { ActivityCardComponentProps } from "@/features/activities/components/cards/types";
import {
	ActivityPlayerIdentity,
} from "@/features/activities/components/cards/ActivityPlayerIdentity";
import { formatActivityTimestamp } from "@/features/activities/lib/activity";
import type { AchievementStreakMilestoneActivity } from "@/features/activities/types/types";

export function AchievementStreakMilestoneCard({
	activity,
}: Readonly<ActivityCardComponentProps<AchievementStreakMilestoneActivity>>) {
	const metadata = activity.metadata;
	const streak = metadata.streak ?? metadata.milestone ?? 0;

	return (
		<div className='relative overflow-hidden rounded-3xl border border-accent/35 bg-gradient-to-br from-card via-card to-accent/10 p-4'>
			<div className='pointer-events-none absolute -right-8 top-2 h-24 w-28 rotate-12 rounded-full bg-accent/15 blur-3xl' />

			<div className='relative flex items-start justify-between gap-3'>
				<div className='inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-accent-foreground'>
					<FlameIcon className='size-3 text-accent' />
					Streak Milestone
				</div>
				<span className='shrink-0 text-xs font-medium text-muted-foreground'>
					{formatActivityTimestamp(activity.createdAt)}
				</span>
			</div>

			<div className='relative mt-3 space-y-3'>
				<ActivityPlayerIdentity
					username={metadata.member.username}
					avatarSize='default'
					nameClassName='text-base text-foreground'
				/>
				<div className='flex items-end gap-2'>
					<p className='text-4xl font-bold leading-none tabular-nums text-accent'>
						{streak}
					</p>
					<p className='pb-1 text-sm font-semibold uppercase tracking-[0.03em] text-foreground/85'>
						win streak
					</p>
				</div>
				<p className='text-base font-semibold leading-snug text-foreground text-wrap-balance'>
					🔥 {metadata.member.username} is on a {streak} game streak
				</p>
			</div>
		</div>
	);
}
