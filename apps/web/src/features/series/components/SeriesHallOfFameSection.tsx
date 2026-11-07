import type { Series } from "@/features/series/types/series";
import type { SeriesAward, SeriesPlacement } from "@/shared/lib/api";
import {
	getSeriesAwardLabel,
	getSeriesAwardValue,
	getSeriesPlacementLabel,
} from "@/shared/lib/seriesRewards";
import {
	getAwardVisual,
	getChampionshipVisual,
} from "@/shared/lib/seriesRecognitionVisuals";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui";
import { TrophyIcon } from "lucide-react";
import type { ReactNode } from "react";

type SeriesHallOfFameSectionProps = {
	series: Series;
	seriesPlacements: SeriesPlacement[];
	isSeriesPlacementsLoading: boolean;
	seriesAwards: SeriesAward[];
	isSeriesAwardsLoading: boolean;
};

function getPlacementToneClass(placement: number): string {
	return getChampionshipVisual(placement).textClassName;
}

function getPlacementCardClass(placement: number): string {
	if (placement === 1 || placement === 2 || placement === 3) {
		return cn(getChampionshipVisual(placement).ringClassName, "shadow-sm");
	}

	return "border-border/60 bg-card shadow-sm";
}

function getPlacementPointsPillClass(placement: number): string {
	if (placement === 1 || placement === 2 || placement === 3) {
		return cn(
			getChampionshipVisual(placement).textClassName,
			"bg-current/10",
		);
	}

	return "bg-muted/50 text-foreground";
}

export function SeriesHallOfFameSection({
	seriesPlacements,
	isSeriesPlacementsLoading,
	seriesAwards,
	isSeriesAwardsLoading,
}: Readonly<SeriesHallOfFameSectionProps>) {
	const champion =
		seriesPlacements.find((entry) => entry.placement === 1) ?? null;
	const podiumRunners = seriesPlacements.filter(
		(entry) => entry.placement === 2 || entry.placement === 3,
	);

	let hallOfChampionsContent: ReactNode;
	let seriesAwardsContent: ReactNode;

	if (isSeriesPlacementsLoading) {
		hallOfChampionsContent = (
			<div className='rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground'>
				Loading champions...
			</div>
		);
	} else if (champion) {
		hallOfChampionsContent = (
			<div className='space-y-4'>
				<div
					className={`rounded-2xl border p-6 ${getPlacementCardClass(1)}`}
				>
					<div className='flex items-stretch justify-between gap-4'>
						<div className='space-y-2'>
							<p className='text-sm font-medium text-rank-1'>
								Series Champion
							</p>
							<p className='text-2xl font-semibold md:text-3xl'>
								{champion.username}
							</p>
							<div
								className={`inline-flex items-end gap-2 rounded-lg px-3 py-2 ${getPlacementPointsPillClass(1)}`}
							>
								<p className='text-2xl font-semibold leading-none tabular-nums'>
									{Math.round(
										champion.points,
									).toLocaleString()}
								</p>
								<p className='text-xs text-current/80'>pts</p>
							</div>
						</div>
						<div className='flex flex-col items-center justify-between gap-2'>
							<Badge className='bg-rank-1/15 text-rank-1'>
								Rank #1
							</Badge>
							<TrophyIcon className='flex-1 my-auto h-14 w-14 text-rank-1' />
						</div>
					</div>
				</div>

				<div className='grid grid-cols-2 gap-3 sm:grid-cols-2'>
					{podiumRunners.map((entry) => (
						<div
							key={entry.id}
							className={`rounded-xl border p-4 ${getPlacementCardClass(entry.placement)}`}
						>
							<p className='flex justify-between items-center text-xs text-muted-foreground'>
								<span>
									{getSeriesPlacementLabel(entry.placement)}
								</span>
								<span
									className={`rounded-md px-1.5 py-0.5 tracking-wider ${getPlacementToneClass(entry.placement)} bg-current/10`}
								>
									#{entry.placement}
								</span>
							</p>
							<p className='text-base font-semibold'>
								{entry.username}
							</p>
							<div
								className={`inline-flex items-end gap-2 rounded-md px-2.5 py-1.5 ${getPlacementPointsPillClass(entry.placement)}`}
							>
								<p className='text-sm font-semibold tabular-nums'>
									{Math.round(entry.points).toLocaleString()}
								</p>
								<p className='text-[11px] text-current/80'>
									pts
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	} else {
		hallOfChampionsContent = (
			<div className='rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground'>
				No placements available yet.
			</div>
		);
	}

	if (isSeriesAwardsLoading) {
		seriesAwardsContent = (
			<div className='rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground'>
				Loading awards...
			</div>
		);
	} else if (seriesAwards.length > 0) {
		seriesAwardsContent = (
			<div className='rounded-2xl border border-border/60 bg-card p-2'>
				{seriesAwards.map((award) => {
					const awardVisual = getAwardVisual(award.award_type);
					const awardLabel = getSeriesAwardLabel(award.award_type);
					const awardValue = award.value
						? getSeriesAwardValue(award.award_type, award.value)
						: null;

					return (
						<div
							key={award.id}
							className='border-b border-border/60 p-3 last:border-b-0'
						>
							<div className='space-y-2'>
								<p className='flex items-center gap-2 text-sm font-medium text-foreground'>
									<span>
										<awardVisual.Icon
											className={cn(
												"h-4 w-4",
												awardVisual.textClassName,
											)}
										/>
									</span>
									<span className={`flex-1 font-semibold`}>
										{awardLabel}
									</span>
									{awardValue ? (
										<p
											className={cn(
												"rounded-md bg-muted/50 px-2.5 py-1 text-xs font-mono tabular-nums",
												awardVisual.textClassName,
											)}
										>
											{awardValue}
										</p>
									) : null}
								</p>
								<p className={`text-xs text-muted-foreground`}>
									{award.description}
								</p>
								<p className='font-semibold'>
									{award.username}
								</p>
							</div>
						</div>
					);
				})}
			</div>
		);
	} else {
		seriesAwardsContent = (
			<div className='rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground'>
				No awards available yet.
			</div>
		);
	}

	return (
		<div className='flex flex-col gap-6'>
			<section className='space-y-4'>
				<h3 className='text-lg font-semibold'>Hall of Champions</h3>
				{hallOfChampionsContent}
			</section>

			<section className='space-y-3'>
				<h3 className='text-lg font-semibold'>Special Awards</h3>
				{seriesAwardsContent}
			</section>
		</div>
	);
}
