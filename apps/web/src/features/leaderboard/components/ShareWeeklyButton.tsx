import { useState } from "react";
import { Share2Icon } from "lucide-react";
import { Button } from "@/shared/ui";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useSeriesWeeklyRecap } from "@/features/leaderboard/hooks/leaderboard";
import type { Series } from "@/features/series/types/series";
import {
	WeeklyStandingsCard,
	type WeeklyStandingsCardData,
} from "@/features/share/cards/WeeklyStandingsCard";
import { shareHost, shareLink, ShareSheet } from "@/features/share";

type Props = {
	series: Pick<Series, "id" | "title">;
	variant?: "linear" | "outline";
	className?: string;
	label?: string;
};

// Opens the share sheet with last week's standings and biggest movers.
// Hidden until the series has had its first Monday.
export function ShareWeeklyButton({
	series,
	variant = "outline",
	className,
	label = "Share this week",
}: Readonly<Props>) {
	const { room } = useRoomContext();
	const [isOpen, setIsOpen] = useState(false);
	const { data: recap } = useSeriesWeeklyRecap(room.id, series.id);

	if (!recap || recap.standings.length === 0) {
		return null;
	}

	const toMover = (mover: typeof recap.climber) =>
		mover && mover.rank_change !== null
			? {
					username: mover.username,
					rank: mover.rank,
					rankChange: mover.rank_change,
				}
			: null;

	const data: WeeklyStandingsCardData = {
		roomName: room.name,
		roomCode: room.code,
		host: shareHost(),
		seriesTitle: series.title,
		weekNumber: recap.week_number,
		hasPrevious: recap.has_previous,
		standings: recap.standings.map((entry) => ({
			rank: entry.rank,
			username: entry.username,
			balance: entry.balance,
			rankChange: entry.rank_change,
			isNew: entry.is_new,
		})),
		climber: toMover(recap.climber),
		faller: toMover(recap.faller),
	};
	const leader = recap.standings[0];

	return (
		<>
			<Button
				variant={variant}
				className={className}
				onClick={() => setIsOpen(true)}
			>
				<Share2Icon />
				{label}
			</Button>
			<ShareSheet
				open={isOpen}
				onOpenChange={setIsOpen}
				title={`Share week ${recap.week_number}`}
				description='Last week’s top 5 and who moved the most. Friends who tap the link can join the room.'
				message={`${leader.username} leads ${series.title} after week ${recap.week_number} on Crow.`}
				link={shareLink(room.code, "weekly-card", `/rooms/${room.code}/leaderboard`)}
				kind='weekly-card'
				roomId={room.id}
				fileName={`crow-week-${recap.week_number}-${series.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
				renderCard={(format) => <WeeklyStandingsCard data={data} format={format} />}
			/>
		</>
	);
}
