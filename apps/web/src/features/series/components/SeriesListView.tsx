import {
	SeriesSectionHeader,
	SeriesSectionHeaderSkeleton,
} from "@/features/series/components/SeriesSectionHeader";
import {
	SeriesTile,
	SeriesTileSkeleton,
} from "@/features/series/components/SeriesTile";
import type { Series } from "@/features/series/types/series";
import { Button, Reveal, SkeletonList } from "@/shared/ui";
import { PlusIcon } from "lucide-react";
import { UpNextCard } from "@/features/series/components/UpNextCard";

type SeriesListViewProps = {
	isPending: boolean;
	activeSeries: Series[];
	completedSeries: Series[];
	roomId: string;
	roomCode: string;
	// The series the room view follows, marked on its tile.
	currentSeriesId: string | null;
	isOrganizer: boolean;
	onCreateNew: () => void;
};

export function SeriesListView({
	isPending,
	activeSeries,
	completedSeries,
	roomId,
	roomCode,
	currentSeriesId,
	isOrganizer,
	onCreateNew,
}: Readonly<SeriesListViewProps>) {
	return (
		<div className='mx-auto w-full max-w-md space-y-5 p-4'>
			<div>
				<div className={`flex items-center justify-between`}>
					<h2 className='flex-1 text-lg font-semibold'>Series</h2>
					{isOrganizer && (
						<Button
							className={`rounded-2xl`}
							variant='secondary'
							size='sm'
							onClick={onCreateNew}
						>
							<PlusIcon className='h-4 w-4' />
							New
						</Button>
					)}
				</div>
				<p className='mt-1 text-sm text-muted-foreground'>
					Browse active and completed runs.
				</p>
			</div>

			{isPending ? (
				<section aria-hidden='true' className='space-y-3'>
					<SeriesSectionHeaderSkeleton />
					<SkeletonList
						count={2}
						className='space-y-3'
						renderItem={() => <SeriesTileSkeleton />}
					/>
				</section>
			) : (
				<>
					<section className='space-y-3'>
						<SeriesSectionHeader
							label='Active'
							count={activeSeries.length}
						/>
						{activeSeries.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								No active series.
							</p>
						) : (
							<div className='space-y-3'>
								{activeSeries.map((series, index) => (
									<Reveal key={series.id} index={index}>
										<SeriesTile
											series={series}
											roomCode={roomCode}
											isCurrent={
												series.id === currentSeriesId
											}
										/>
									</Reveal>
								))}
							</div>
						)}
					</section>

					<UpNextCard roomId={roomId} roomCode={roomCode} />

					<section className='space-y-3'>
						<SeriesSectionHeader
							label='Completed'
							count={completedSeries.length}
						/>
						{completedSeries.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								No completed series.
							</p>
						) : (
							<div className='space-y-3'>
								{completedSeries.map((series, index) => (
									<Reveal key={series.id} index={index}>
										<SeriesTile
											series={series}
											roomCode={roomCode}
											isCurrent={
												series.id === currentSeriesId
											}
										/>
									</Reveal>
								))}
							</div>
						)}
					</section>
				</>
			)}
		</div>
	);
}
