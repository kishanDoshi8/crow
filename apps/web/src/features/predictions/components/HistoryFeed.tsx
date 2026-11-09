import type {
	PredictionHistoryFilter} from "@/features/leaderboard";
import {
	PredictionHistoryFeed,
	PredictionHistoryFeedSkeleton,
	usePredictionHistory
} from "@/features/leaderboard";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button } from "@/shared/ui";
import {
	SeriesScopeToggle,
	type SeriesScope,
	useCurrentSeries,
} from "@/features/series";

const FILTERS: Array<{ label: string; value: PredictionHistoryFilter }> = [
	{ label: "All", value: "all" },
	{ label: "Wins", value: "wins" },
	{ label: "Losses", value: "losses" },
	{ label: "My Bets", value: "my_bets" },
];

function emptyStateMessage(
	filter: PredictionHistoryFilter,
	search: string,
	scope: SeriesScope,
) {
	if (search.trim().length > 0) {
		return "No predictions match your search.";
	}

	const where = scope === "series" ? " in this series" : "";
	switch (filter) {
		case "wins":
			return `No wins${where} yet.`;
		case "losses":
			return `No losses${where} yet.`;
		case "my_bets":
			return `You haven't placed any bets${where} yet.`;
		default:
			return `No finished predictions${where} yet.`;
	}
}

function HistoryFeed() {
	const { room } = useRoomContext();
	const [filter, setFilter] = useState<PredictionHistoryFilter>("all");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const { currentSeries } = useCurrentSeries(room.id);
	const [scope, setScope] = useState<SeriesScope>("series");
	const seriesId = scope === "series" ? currentSeries?.id : undefined;
	const loadMoreRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const timeoutId = globalThis.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
		}, 300);

		return () => globalThis.clearTimeout(timeoutId);
	}, [searchInput]);

	const {
		data,
		isPending: isHistoryLoading,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	} = usePredictionHistory(
		room.id,
		filter,
		debouncedSearch,
		seriesId,
	);

	const history = useMemo(
		() => data?.pages.flatMap((page) => page.items) ?? [],
		[data],
	);

	useEffect(() => {
		const node = loadMoreRef.current;
		if (!node || !hasNextPage) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const first = entries[0];
				if (
					first?.isIntersecting &&
					hasNextPage &&
					!isFetchingNextPage
				) {
					fetchNextPage();
				}
			},
			{
				rootMargin: "200px 0px",
			},
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	return (
		<div className={`flex flex-col gap-4 p-4 max-w-lg mx-auto w-full lg:max-w-2xl lg:pt-6`}>
			{/* Section heading */}
			<div>
				<h2 className='text-lg font-semibold'>History</h2>
				<p className='text-sm text-muted-foreground'>
					Finished predictions and who called them.
				</p>
			</div>

			<div className='space-y-3'>
				<Input
					type='search'
					placeholder='Search prediction titles...'
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
				/>
				<SeriesScopeToggle
					value={scope}
					onValueChange={setScope}
					seriesTitle={currentSeries?.title}
				/>
				<div className='flex flex-wrap gap-2'>
					{FILTERS.map((item) => (
						<Button
							key={item.value}
							size='sm'
							variant={
								filter === item.value ? "default" : "outline"
							}
							onClick={() => setFilter(item.value)}
						>
							{item.label}
						</Button>
					))}
				</div>
			</div>

			<PredictionHistoryFeed
				entries={history}
				isLoading={isHistoryLoading}
				emptyMessage={emptyStateMessage(
					filter,
					debouncedSearch,
					scope,
				)}
			/>

			<div ref={loadMoreRef} className='h-4' />

			{isFetchingNextPage && <PredictionHistoryFeedSkeleton count={2} />}
		</div>
	);
}

export default HistoryFeed;
