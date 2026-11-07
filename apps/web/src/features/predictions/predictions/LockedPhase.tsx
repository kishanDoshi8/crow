import { Badge, FadeContent, Skeleton } from "@/shared/ui";
import type { Prediction } from "@/features/predictions/types/types";
import PredictionTitle from "../components/PredictionTitle";
import PredictionOptions from "../widgets/PredictionOptions";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useBets } from "@/features/predictions/hooks/bet";
import { useEffect } from "react";
import { usePlayer } from "@/features/home";
import { getOptionColor } from "@/shared/hooks/useOptionColor";
import { ClockIcon, LockIcon } from "lucide-react";
import LockControls from "../controls/LockControls";
import { BetListSkeleton } from "../components/BetListSkeleton";
import { roomPlayerName, useRoomBetRealtime } from "@/features/rooms";
import PredictionData from "./PredictionData";

type Props = {
	prediction: Prediction | null | undefined;
	selectedOption: string | null;
};

const contentDelays = {
	title: 0,
	data: 50,
	options: 100,
	bets: 100,
};

export default function LockedPhase({
	prediction,
	selectedOption,
}: Readonly<Props>) {
	const { room } = useRoomContext();
	const { data: player } = usePlayer();
	const {
		data: bets,
		isLoading: isBetsLoading,
		refetch: refetchBets,
	} = useBets(room.id, prediction?.id);

	useRoomBetRealtime(room.id, prediction?.id ?? null);

	useEffect(() => {
		if (prediction) {
			refetchBets();
		}
	}, [prediction]);

	const getPlayerName = (playerId: string) => {
		if (player?.id === playerId) {
			return player.username + " (You)";
		}
		return roomPlayerName(room, playerId) ?? "Unknown";
	};

	return (
		<div className={`flex-1 flex flex-col gap-4 items-center pb-4`}>
			<div
				className={`flex flex-col gap-4 justify-center w-full max-w-md mx-auto relative overflow-hidden rounded-2xl bg-linear-to-br from-accent/15 via-card to-primary/10 border border-accent/20 p-5`}
			>
				{prediction?.status === "locked" ? (
					<Badge
						className={`mx-auto bg-accent/25 text-accent font-semibold`}
					>
						<LockIcon className={`w-3 h-3 mr-2`} />
						BETS CLOSED
					</Badge>
				) : (
					<Skeleton className={`h-5.5 w-28 mx-auto rounded-full`} />
				)}

				<PredictionTitle
					prediction={prediction}
					fadeDelay={contentDelays.title}
				/>

				{prediction ? (
					<Badge
						className={`mx-auto py-2 rounded-md bg-secondary/70 text-base text-accent/70`}
					>
						<FadeContent
							delay={contentDelays.data}
							className={`flex gap-2 items-center`}
						>
							<ClockIcon
								className={`w-5! h-5! text-accent animate-pulse inline-block`}
							/>
							Awaiting Results
						</FadeContent>
					</Badge>
				) : (
					<Skeleton className={`h-10.5 w-44 mx-auto`} />
				)}

				<PredictionData
					prediction={prediction}
					fadeDelay={contentDelays.data}
				/>

				<PredictionOptions
					prediction={prediction}
					selectedOption={selectedOption}
					setSelectedOption={() => {}}
					fadeDelay={contentDelays.options}
				/>
			</div>

			<div className={`max-w-md w-full mx-auto mt-4`}>
				<div className={`flex mb-2`}>
					<p className={`text-2xl`}>Who bet what?</p>
				</div>
				{isBetsLoading ? (
					<BetListSkeleton />
				) : (
					<FadeContent
						delay={contentDelays.bets}
						className={`rounded-xl overflow-hidden border border-border`}
					>
						{bets?.map((bet) => (
							<div
								key={bet.id}
								className={`flex justify-between border-b border-secondary bg-card hover:bg-secondary p-4`}
							>
								<div>
									<p>{getPlayerName(bet.player_id)}</p>
								</div>
								<div>
									<p>{bet.amount} PTS</p>
									<p
										className={`text-sm text-right ${getOptionColor(bet.option?.id ?? "")}`}
									>
										on {bet.option?.label ?? "Unknown"}
									</p>
								</div>
							</div>
						))}
					</FadeContent>
				)}
			</div>

			{prediction && <LockControls prediction={prediction} />}
		</div>
	);
}
