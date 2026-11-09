import { SeriesOrganizerActionsMenu } from "@/features/series/components/SeriesOrganizerActionsMenu";
import { SeriesStatusBadge } from "@/features/series/components/SeriesStatusBadge";
import { getSeriesProgress } from "@/features/series/lib/progress";
import type { Series } from "@/features/series/types/series";
import { Field, FieldLabel, Progress, Skeleton } from "@/shared/ui";

const PROGRESS_PANEL = "mt-2 space-y-3 rounded-xl border bg-card p-3";
const STAT_CELL = "rounded-lg border p-2";

type SeriesOverviewCardProps = {
	series: Series;
	isOrganizer: boolean;
	canArchive: boolean;
	isActionPending: boolean;
	onEdit: () => void;
	onArchive: () => void;
	onCloseSeries: () => void;
	scheduledCount?: number;
};

export function SeriesOverviewCard({
	series,
	isOrganizer,
	canArchive,
	isActionPending,
	onEdit,
	onArchive,
	onCloseSeries,
	scheduledCount = 0,
}: Readonly<SeriesOverviewCardProps>) {
	const progress = getSeriesProgress(series);
	const stats = progress.isOpenEnded
		? [
				{ label: "Resolved", value: progress.resolved },
				{ label: "Open", value: progress.open },
				{ label: "Cancelled", value: series.cancelledPredictions },
			]
		: [
				{ label: "Expected", value: progress.expected },
				{ label: "Completed", value: progress.resolved },
				{ label: "Remaining", value: progress.remaining },
			];

	return (
		<section className='rounded-2xl'>
			<SeriesStatusBadge status={series.status} />
			<div className='flex items-start justify-between gap-3 mt-2'>
				<h2 className='text-lg font-semibold leading-tight my-auto'>
					{series.title}
				</h2>
				{isOrganizer ? (
					<SeriesOrganizerActionsMenu
						series={series}
						isPending={isActionPending}
						canArchive={canArchive}
						onEdit={onEdit}
						onArchive={onArchive}
						onCloseSeries={onCloseSeries}
						scheduledCount={scheduledCount}
					/>
				) : null}
			</div>
			{series.description?.trim() && (
				<p className='text-sm text-muted-foreground'>
					{series.description.trim()}
				</p>
			)}

			<div className={PROGRESS_PANEL}>
				{progress.isOpenEnded ? (
					<p className='text-xs text-muted-foreground'>
						Open-ended: no set number of games.
					</p>
				) : (
					<Field>
						<FieldLabel>
							<p className='text-xs text-muted-foreground mr-auto'>
								{progress.resolved} / {progress.expected}
							</p>
							<p>{progress.percent}%</p>
						</FieldLabel>
						<Progress
							value={progress.percent}
							indicatorBgClassName={
								series.status === "completed"
									? "bg-win"
									: "bg-linear-to-r from-primary to-accent"
							}
							className={`-mt-1`}
						/>
					</Field>
				)}
				<div className='grid grid-cols-3 gap-2 text-center text-xs'>
					{stats.map((stat) => (
						<div key={stat.label} className={STAT_CELL}>
							<p className='text-muted-foreground'>{stat.label}</p>
							<p className='mt-1 text-sm font-semibold'>
								{stat.value}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

// Status, title, then the progress panel with its three counts.
export function SeriesOverviewCardSkeleton() {
	return (
		<section aria-hidden='true'>
			<Skeleton className='h-5.5 w-16 rounded-full' />
			<div className='mt-2 flex h-8 items-center'>
				<Skeleton className='h-5 w-48' />
			</div>
			<div className={PROGRESS_PANEL}>
				<div className='flex flex-col gap-2'>
					<div className='flex h-6 items-center justify-between'>
						<Skeleton className='h-3 w-12' />
						<Skeleton className='h-4 w-8' />
					</div>
					<Skeleton className='h-2 w-full rounded-full' />
				</div>
				<div className='grid grid-cols-3 gap-2'>
					{[0, 1, 2].map((cell) => (
						<div
							key={cell}
							className={`${STAT_CELL} flex flex-col items-center gap-2`}
						>
							<Skeleton className='my-0.5 h-3 w-14' />
							<Skeleton className='my-0.5 h-4 w-6' />
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
