import { InPlayPredictions, UserStats } from "@/features/predictions";
import { NeedsYouCard } from "@/features/rooms/components/NeedsYouCard";
import { SeriesHeroCard } from "@/features/rooms/components/SeriesHeroCard";
import { SmallRoomInviteCard } from "@/features/rooms/components/SmallRoomInviteCard";
import { ResultsCard } from "@/features/rooms/components/ResultsCard";
import { WeeklyRecapCard } from "@/features/rooms/components/WeeklyRecapCard";
import { RoomChecklist } from "@/features/rooms/components/RoomChecklist";
import { UpNextBallot, useCurrentSeries } from "@/features/series";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useIsDesktop } from "@/shared/lib/useMediaQuery";

function RoomDashboard() {
	const { room } = useRoomContext();
	const isDesktop = useIsDesktop();
	const isHost = useRoomRole(room).can.organize;
	// Nothing running: what to predict next is the question on Home, asked
	// near the top. While a series runs it waits at the bottom.
	const { hasActiveSeries, isPending: isSeriesPending } = useCurrentSeries(room.id);
	const askNow = !isSeriesPending && !hasActiveSeries;
	const upNext = (variant: "prompt" | "compact") => (
		<UpNextBallot roomId={room.id} roomCode={room.code} variant={variant} isHost={isHost} />
	);

	// Desktop: where you stand and what's open on the left, everything else
	// in a column on the right. Phones and tablets keep one column, as below.
	if (isDesktop) {
		return (
			<div className='mx-auto grid w-full max-w-260 grid-cols-[minmax(0,1fr)_20rem] items-start gap-8 px-8 pt-4'>
				<div className='flex min-w-0 flex-col gap-2'>
					<SeriesHeroCard />
					<RoomChecklist room={room} isHost={isHost} />
					{askNow ? <div className='mt-2'>{upNext("prompt")}</div> : null}
					<InPlayPredictions layout='grid' />
				</div>
				<aside aria-label='More in this room' className='flex min-w-0 flex-col gap-1 pt-4'>
					<WeeklyRecapCard />
					<NeedsYouCard />
					<ResultsCard />
					<SmallRoomInviteCard />
					<div className='mt-6'>
						<UserStats />
					</div>
					{askNow ? null : <div className='mt-6 mb-4'>{upNext("compact")}</div>}
				</aside>
			</div>
		);
	}

	return (
		<div className={`px-4`}>
			<div className={`mt-2`}>
				<SeriesHeroCard />
				<RoomChecklist room={room} isHost={isHost} />
				{askNow ? <div className='mt-3'>{upNext("prompt")}</div> : null}
				<ResultsCard />
				<WeeklyRecapCard />
				<NeedsYouCard />
				<SmallRoomInviteCard />
			</div>

			<div className={`mt-4`}>
				<InPlayPredictions />
			</div>

			<div className={`mt-6`}>
				<UserStats />
			</div>

			{askNow ? null : <div className='mt-6 mb-4'>{upNext("compact")}</div>}
		</div>
	);
}

export default RoomDashboard;
