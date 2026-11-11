import {
	SeriesSectionHeader,
	SeriesSectionHeaderSkeleton,
} from "@/features/series/components/SeriesSectionHeader";
import {
	FINISHED_ROW,
	FinishedSeriesRow,
	SeriesTile,
	SeriesTileSkeleton,
} from "@/features/series/components/SeriesTile";
import { useMySeriesWallets } from "@/features/series/hooks/wallets";
import { cn } from "@/shared/lib/utils";
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
	// Your points per series: every series you've joined, finished ones too.
	const { data: wallets = [] } = useMySeriesWallets(roomId);
	const walletOf = (seriesId: string) =>
		wallets.find((wallet) => wallet.series_id === seriesId) ?? null;

	return (
		<div className='mx-auto w-full max-w-md space-y-5 p-4 lg:max-w-2xl lg:pt-6'>
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
							New series
						</Button>
					)}
				</div>
				<p className='mt-1 text-sm text-muted-foreground'>
					Each series has its own points, table and title.
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
							label='Playing now'
							count={activeSeries.length}
						/>
						{activeSeries.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								Nothing is being played right now.
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
											wallet={walletOf(series.id)}
										/>
									</Reveal>
								))}
							</div>
						)}
					</section>

					<UpNextCard roomId={roomId} roomCode={roomCode} />

					<section className='space-y-3'>
						<SeriesSectionHeader
							label='Finished'
							count={completedSeries.length}
						/>
						{completedSeries.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								No series has finished yet.
							</p>
						) : (
							<div className='overflow-hidden rounded-2xl border bg-card'>
								<div
									aria-hidden='true'
									className={cn(FINISHED_ROW, "py-2 text-xs font-medium text-muted-foreground")}
								>
									<span>Series</span>
									<span className='text-right'>Your net</span>
									<span />
								</div>
								{completedSeries.map((series) => (
									<FinishedSeriesRow
										key={series.id}
										series={series}
										roomCode={roomCode}
										isCurrent={series.id === currentSeriesId}
										wallet={walletOf(series.id)}
									/>
								))}
							</div>
						)}
					</section>
				</>
			)}
		</div>
	);
}
