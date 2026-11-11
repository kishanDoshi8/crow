import type { PredictionHistoryFilter } from "@/features/leaderboard";
import {
	PredictionHistoryFeed,
	PredictionHistoryFeedSkeleton,
	usePredictionHistory,
	usePredictionHistoryCounts,
} from "@/features/leaderboard";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { SearchIcon } from "lucide-react";
import {
	SeriesScopeToggle,
	type SeriesScope,
	useCurrentSeries,
} from "@/features/series";

// Each filter is your outcome, and carries how many predictions it holds,
// so the row doubles as your record.
const FILTERS: Array<{
	label: string;
	value: PredictionHistoryFilter;
	count: "all" | "wins" | "losses" | "my_bets";
	// A dot in the outcome's colour.
	dot?: string;
}> = [
	{ label: "All", value: "all", count: "all" },
	{ label: "Won", value: "wins", count: "wins", dot: "bg-win" },
	{ label: "Lost", value: "losses", count: "losses", dot: "bg-loss" },
	{ label: "My bets", value: "my_bets", count: "my_bets" },
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

	const { data: counts } = usePredictionHistoryCounts(
		room.id,
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
				<SeriesScopeToggle
					value={scope}
					onValueChange={setScope}
					seriesTitle={currentSeries?.title}
				/>
				<label className='flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'>
					<SearchIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
					<span className='sr-only'>Search prediction titles</span>
					<input
						type='search'
						placeholder='Search prediction titles'
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						className='min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm'
					/>
				</label>
				<div role='group' aria-label='Filter by your outcome' className='flex gap-1.5 overflow-x-auto'>
					{FILTERS.map((item) => {
						const isOn = filter === item.value;
						return (
							<button
								key={item.value}
								type='button'
								aria-pressed={isOn}
								onClick={() => setFilter(item.value)}
								className={cn(
									"flex h-9.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
									isOn
										? "border-foreground bg-foreground font-semibold text-background"
										: "font-medium text-muted-foreground hover:text-foreground",
								)}
							>
								{item.dot ? (
									<span aria-hidden='true' className={cn("size-2 rounded-full", item.dot)} />
								) : null}
								{item.label}
								{counts ? (
									<span className='font-semibold tabular-nums'>{counts[item.count]}</span>
								) : null}
							</button>
						);
					})}
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
