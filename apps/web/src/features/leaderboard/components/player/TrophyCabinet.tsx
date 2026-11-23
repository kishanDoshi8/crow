import { Reveal } from "@/shared/ui";
import type { RoomMemberMilestone } from "@/shared/lib/api";
import {
	getMilestoneVisual,
	getTrophyVisual,
} from "@/shared/lib/seriesRecognitionVisuals";
import {
	AWARD_TIER_LABEL,
	SERIES_TIER_ORDER,
	formatTrophyDate,
	formatTrophyValue,
	type SeriesTier,
	type Trophy,
} from "@/shared/lib/trophyPrestige";
import { cn } from "@/shared/lib/utils";
import { ChevronLeftIcon } from "lucide-react";

type Props = {
	trophies: Trophy[];
	milestones: RoomMemberMilestone[];
	onBack: () => void;
	// What the back link returns to ("Back to card" in the player card).
	backLabel?: string;
};

const TIER_HEADING: Record<SeriesTier, string> = {
	major: "Major series",
	standard: "Series",
	minor: "Minor series",
};

function TrophyRow({ trophy, index }: { trophy: Trophy; index: number }) {
	const visual = getTrophyVisual(trophy);
	const detail = [
		trophy.kind === "award" ? AWARD_TIER_LABEL[trophy.awardTier] : null,
		formatTrophyValue(trophy),
		formatTrophyDate(trophy.wonAt),
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<Reveal
			as='li'
			index={index}
			className='flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3'
		>
			<div
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-full border",
					visual.ringClassName,
				)}
			>
				<visual.Icon className={cn("size-5", visual.textClassName)} />
			</div>
			<div className='min-w-0 flex-1'>
				<p className='truncate text-sm font-semibold text-foreground'>
					{trophy.seriesTitle}
				</p>
				<p className={cn("text-xs font-medium", visual.textClassName)}>
					{visual.label}
				</p>
				<p className='text-xs tabular-nums text-muted-foreground'>
					{detail}
				</p>
			</div>
		</Reveal>
	);
}

// Every trophy, grouped by how big the series was.
export function TrophyCabinet({
	trophies,
	milestones,
	onBack,
	backLabel = "Back to card",
}: Readonly<Props>) {
	const groups = SERIES_TIER_ORDER.map((tier) => ({
		tier,
		items: trophies.filter((trophy) => trophy.tier === tier),
	})).filter((group) => group.items.length > 0);

	return (
		<div className='flex flex-col gap-4'>
			<button
				type='button'
				onClick={onBack}
				className='flex w-fit items-center gap-1 rounded-md py-0.5 pr-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
			>
				<ChevronLeftIcon className='size-4' />
				{backLabel}
			</button>

			{groups.map((group) => (
				<section key={group.tier} className='flex flex-col gap-2'>
					<h3 className='flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
						{TIER_HEADING[group.tier]}
						<span className='tabular-nums'>{group.items.length}</span>
					</h3>
					<ul className='flex flex-col gap-2'>
						{group.items.map((trophy, index) => (
							<TrophyRow key={trophy.id} trophy={trophy} index={index} />
						))}
					</ul>
				</section>
			))}
			{milestones.length > 0 ? (
				<section className='flex flex-col gap-2'>
					<h3 className='flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
						Milestones
						<span className='tabular-nums'>{milestones.length}</span>
					</h3>
					<ul className='flex flex-col gap-2'>
						{milestones.map((milestone, index) => {
							const visual = getMilestoneVisual(milestone.milestone_type);
							return (
								<Reveal
									as='li'
									key={milestone.id}
									index={index}
									className='flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3'
								>
									<div className='flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40'>
										<visual.Icon className='size-5 text-foreground/80' />
									</div>
									<div className='min-w-0 flex-1'>
										<p className='text-sm font-semibold text-foreground'>
											{visual.label}
										</p>
										<p className='text-xs text-muted-foreground'>
											{visual.description} {formatTrophyDate(milestone.achieved_at)}
										</p>
									</div>
								</Reveal>
							);
						})}
					</ul>
				</section>
			) : null}
		</div>
	);
}
