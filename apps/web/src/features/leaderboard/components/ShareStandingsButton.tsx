import { useState } from "react";
import { Share2Icon } from "lucide-react";
import { Button } from "@/shared/ui";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useSeriesLeaderboard } from "@/features/leaderboard/hooks/leaderboard";
import { splitStandings } from "@/features/leaderboard/lib/standings";
import { useSeriesAwards } from "@/features/series";
import type { Series } from "@/features/series/types/series";
import { StandingsCard, type StandingsCardData } from "@/features/share/cards/StandingsCard";
import { shareHost, shareLink, ShareSheet } from "@/features/share";
import { getSeriesAwardLabel, getSeriesAwardValue } from "@/shared/lib/seriesRewards";
import { FEATURES } from "@/shared/constants/features";

type Props = {
	series: Pick<Series, "id" | "title">;
	variant?: "linear" | "outline";
	className?: string;
	label?: string;
};

// "Longest Win Streak" reads as "Longest win streak" on the card.
function sentenceCase(label: string) {
	return label.charAt(0) + label.slice(1).toLowerCase();
}

// Opens the share sheet with the series' final standings card.
export function ShareStandingsButton({
	series,
	variant = "outline",
	className,
	label = "Share standings",
}: Readonly<Props>) {
	const { room } = useRoomContext();
	const [isOpen, setIsOpen] = useState(false);
	const { data: standings = [] } = useSeriesLeaderboard(room.id, series.id);
	const { data: awards = [] } = useSeriesAwards(room.id, series.id);

	// Only ranked players make the card; the rest didn't bet enough to place.
	const { ranked } = splitStandings(standings);
	const champion = ranked[0];
	const data: StandingsCardData = {
		roomName: room.name,
		roomCode: room.code,
		host: shareHost(),
		seriesTitle: series.title,
		standings: ranked.map((entry) => ({
			rank: entry.rank,
			username: entry.username,
			balance: entry.balance,
			netProfit: entry.net_profit,
		})),
		awards: awards
			.filter((award) => FEATURES.duels || award.award_type !== "MOST_DUEL_WINS")
			.map((award) => ({
				label: sentenceCase(getSeriesAwardLabel(award.award_type)),
				username: award.username,
				value: String(getSeriesAwardValue(award.award_type, award.value)),
			})),
	};

	return (
		<>
			<Button
				variant={variant}
				className={className}
				onClick={() => setIsOpen(true)}
				disabled={!champion}
			>
				<Share2Icon />
				{label}
			</Button>
			<ShareSheet
				open={isOpen}
				onOpenChange={setIsOpen}
				title='Share the final standings'
				description='Friends who tap the link can join the room for the next series.'
				message={
					champion
						? `${champion.username} won ${series.title} on Verdict.`
						: `${series.title} on Verdict.`
				}
				link={shareLink(room.code, "champion-card", `/rooms/${room.code}/series/${series.id}`)}
				kind='champion-card'
				roomId={room.id}
				fileName={`verdict-${series.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
				renderCard={(format) => <StandingsCard data={data} format={format} />}
			/>
		</>
	);
}
