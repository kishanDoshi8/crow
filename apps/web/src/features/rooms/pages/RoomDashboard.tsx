import { InPlayPredictions, UserStats } from "@/features/predictions";
import { NeedsYouCard } from "@/features/rooms/components/NeedsYouCard";
import { SeriesHeroCard } from "@/features/rooms/components/SeriesHeroCard";
import { SmallRoomInviteCard } from "@/features/rooms/components/SmallRoomInviteCard";
import { ResultsCard } from "@/features/rooms/components/ResultsCard";
import { WeeklyRecapCard } from "@/features/rooms/components/WeeklyRecapCard";
import { UpNextCard } from "@/features/series";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useIsDesktop } from "@/shared/lib/useMediaQuery";

function RoomDashboard() {
	const { room } = useRoomContext();
	const isDesktop = useIsDesktop();

	// Desktop: where you stand and what's open on the left, everything else
	// in a column on the right. Phones and tablets keep one column, as below.
	if (isDesktop) {
		return (
			<div className='mx-auto grid w-full max-w-260 grid-cols-[minmax(0,1fr)_20rem] items-start gap-8 px-8 pt-4'>
				<div className='flex min-w-0 flex-col gap-2'>
					<SeriesHeroCard />
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
					<div className='mt-6 mb-4'>
						<UpNextCard roomId={room.id} roomCode={room.code} />
					</div>
				</aside>
			</div>
		);
	}

	return (
		<div className={`px-4`}>
			<div className={`mt-2`}>
				<SeriesHeroCard />
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

			<div className='mt-6 mb-4'>
				<UpNextCard roomId={room.id} roomCode={room.code} />
			</div>
		</div>
	);
}

export default RoomDashboard;
