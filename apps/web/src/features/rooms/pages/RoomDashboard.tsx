import { InPlayPredictions, UserStats } from "@/features/predictions";
import { NeedsYouCard } from "@/features/rooms/components/NeedsYouCard";
import { SeriesHeroCard } from "@/features/rooms/components/SeriesHeroCard";
import { SmallRoomInviteCard } from "@/features/rooms/components/SmallRoomInviteCard";
import { ResultsCard } from "@/features/rooms/components/ResultsCard";
import { WeeklyRecapCard } from "@/features/rooms/components/WeeklyRecapCard";
import { UpNextCard } from "@/features/series";
import { useRoomContext } from "@/shared/lib/roomContext";

function RoomDashboard() {
	const { room } = useRoomContext();
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
