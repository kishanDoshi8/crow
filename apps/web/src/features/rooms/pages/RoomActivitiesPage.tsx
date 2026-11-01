import { useRoomContext } from "@/app/layouts/RoomLayout";
import { useRoomActivities, ActivityFilter } from "@/features/activities";
import { useMarkRoomActivitiesSeen } from "@/features/rooms";
import {
	ActivityFeedSkeleton,
	RoomActivitiesFeed,
} from "@/features/activities/components";
import {
	SeriesScopeToggle,
	type SeriesScope,
	useCurrentSeries,
} from "@/features/series";
import { useEffect, useMemo, useRef, useState } from "react";

export default function RoomActivitiesPage() {
	const { room } = useRoomContext();
	const filter: ActivityFilter = "all";
	const { currentSeries } = useCurrentSeries(room.id);
	const [scope, setScope] = useState<SeriesScope>("all");
	const seriesId = scope === "series" ? currentSeries?.id : undefined;
	const loadMoreRef = useRef<HTMLDivElement | null>(null);
	const hasMarkedSeenRef = useRef(false);
	const { mutate: markActivitiesSeen } = useMarkRoomActivitiesSeen(
		room.code,
		room.id,
	);

	const {
		data,
		isPending,
		isError,
		error,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	} = useRoomActivities(room.id, filter, seriesId);

	const activities = useMemo(
		() => data?.pages.flatMap((page) => page.items) ?? [],
		[data],
	);

	// Clear the unseen dot after a second on this page. Depends only on whether
	// the feed has loaded, so background refreshes don't cancel the timer.
	const isFeedReady = !!data && !isPending && !isError;
	useEffect(() => {
		if (!room.id || !isFeedReady || hasMarkedSeenRef.current) {
			return;
		}

		const timerId = globalThis.setTimeout(() => {
			hasMarkedSeenRef.current = true;
			markActivitiesSeen();
		}, 1000);

		return () => {
			globalThis.clearTimeout(timerId);
		};
	}, [isFeedReady, markActivitiesSeen, room.id]);

	useEffect(() => {
		const node = loadMoreRef.current;
		if (!node || !hasNextPage) {
			return;
		}

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
			{ rootMargin: "200px 0px" },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	return (
		<div className='mx-auto w-full max-w-lg space-y-4 p-4'>
			<div>
				<h2 className='text-lg font-semibold'>Activity</h2>
				<p className='mt-1 text-sm text-muted-foreground'>
					New predictions, results and who joined.
				</p>
			</div>

			<SeriesScopeToggle
				value={scope}
				onValueChange={setScope}
				seriesTitle={currentSeries?.title}
			/>

			<RoomActivitiesFeed
				activities={activities}
				roomCode={room.code}
				showSeries={scope === "all"}
				isLoading={isPending}
				isError={isError}
				errorMessage={
					error instanceof Error ? error.message : undefined
				}
				emptyMessage={
					scope === "series"
						? "Nothing has happened in this series yet."
						: undefined
				}
			/>

			<div ref={loadMoreRef} className='h-4' />

			{isFetchingNextPage ? <ActivityFeedSkeleton count={2} /> : null}
		</div>
	);
}
