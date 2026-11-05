import { Badge, FadeContent, Skeleton } from "@/shared/ui";
import { ResolvedByLine } from "../components/ResolvedByLine";
import { CorrectResultLink } from "../components/CorrectResultLink";
import type { Prediction } from "@/features/predictions/types/types";
import { useBets } from "@/features/predictions/hooks/bet";
import PredictionTitle from "../components/PredictionTitle";
import { BetListSkeleton } from "../components/BetListSkeleton";
import PredictionOptions from "../widgets/PredictionOptions";
import { CheckIcon, CrownIcon } from "lucide-react";
import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";
import { useRoomBetRealtime } from "@/features/rooms";
import PredictionData from "./PredictionData";
import { PlayerProfileDialog } from "@/features/leaderboard";
import { useState } from "react";
import { ResultBanner } from "../components/ResultBanner";
import type { ResultCardData } from "@/features/share";

type Props = {
	prediction: Prediction | null | undefined;
};

const contentDelays = {
	title: 0,
	result: 50,
	data: 100,
	options: 100,
	payout: 100,
};

function ResolvedPhase({ prediction }: Readonly<Props>) {
	const { room } = useRoomContext();
	const { data: player } = usePlayer();
	const { data: bets, isPending: isBetsLoading } = useBets(
		room.id,
		prediction?.id,
	);

	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
		null,
	);
	const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

	useRoomBetRealtime(room.id, prediction?.id ?? null);

	// Hooks above run on every render; bail out only after them.
	if (!prediction) return null;

	const optionLabel = (optionId: string) =>
		prediction.prediction_options.find((option) => option.id === optionId)
			?.label ?? "";
	const myBet = bets?.find((bet) => bet.player_id === player?.id);
	const resultData: ResultCardData | null =
		prediction.status === "revealed" && prediction.winning_option_id && bets
			? {
					roomName: room.name,
					roomCode: room.code,
					host: "",
					seriesTitle: prediction.seriesTitle ?? null,
					predictionNumber: prediction.seriesPredictionNumber ?? null,
					question: prediction.title,
					winner: optionLabel(prediction.winning_option_id),
					calledIt: bets.filter(
						(bet) => bet.option_id === prediction.winning_option_id,
					).length,
					participants: bets.length,
					playerName: player?.username ?? "",
					options: prediction.prediction_options.map((option) => ({
						label: option.label,
						pool: bets
							.filter((bet) => bet.option_id === option.id)
							.reduce((sum, bet) => sum + bet.amount, 0),
						isWinner: option.id === prediction.winning_option_id,
						isMine: option.id === myBet?.option_id,
					})),
					call: myBet
						? {
								pick: optionLabel(myBet.option_id),
								stake: myBet.amount,
								net: (myBet.payout ?? 0) - myBet.amount,
							}
						: null,
				}
			: null;

	const getPlayerName = (playerId: string) => {
		if (player?.id === playerId) {
			return player.username + " (You)";
		}
		const member = room.members.find((m) => m.player_id === playerId);
		return member ? member.player.username : "Unknown";
	};

	return (
		<div className={`flex-1 flex flex-col gap-4 items-center pb-4 mt-4`}>
			<div
				className={`flex flex-col justify-center items-center gap-4 w-full max-w-md max-auto relative overflow-hidden rounded-2xl bg-linear-to-br from-win/20 via-card to-win/10 border border-win/30 p-5`}
			>
				{prediction?.status === "revealed" ? (
					<Badge
						className={`mx-auto bg-win/25 text-win font-semibold`}
					>
						<CheckIcon className={`w-3 h-3`} />
						REVEALED
					</Badge>
				) : (
					<Skeleton className={`h-5.5 w-24 mx-auto rounded-full`} />
				)}

				<PredictionTitle
					prediction={prediction}
					fadeDelay={contentDelays.title}
				/>

				<div
					className={`flex gap-2 items-center justify-center bg-win/10 rounded-xl px-4 py-2`}
				>
					<CrownIcon className={`text-win rounded-full mx-auto`} />
					<p className={`text-center text-lg font-semibold`}>
						<span className={`text-2xl text-win`}>
							{
								prediction.prediction_options.find(
									(option) =>
										option.id ===
										prediction.winning_option_id,
								)?.label
							}
						</span>
					</p>
				</div>

				<ResolvedByLine prediction={prediction} className='-mt-2' />
				<CorrectResultLink prediction={prediction} />

				<PredictionData
					prediction={prediction}
					fadeDelay={contentDelays.data}
				/>

				<PredictionOptions
					prediction={prediction}
					selectedOption={null}
					setSelectedOption={() => {}}
					fadeDelay={contentDelays.options}
				/>
			</div>

			{resultData ? (
				<FadeContent
					delay={contentDelays.result}
					className={`w-full max-w-md mx-auto`}
				>
					<ResultBanner
						roomId={room.id}
						predictionId={prediction.id}
						data={resultData}
					/>
				</FadeContent>
			) : null}

			<div className={`max-w-md w-full mx-auto mt-4`}>
				<div className={`flex mb-2`}>
					<p className={`text-2xl`}>Payout</p>
				</div>
				{isBetsLoading ? (
					<BetListSkeleton variant='payout' />
				) : (
					<FadeContent
						delay={contentDelays.payout}
						className={`rounded-xl overflow-hidden border border-border`}
					>
						{bets?.map((bet) => (
							<button
								key={bet.id}
								className={`flex justify-between border-b border-secondary bg-card hover:bg-secondary p-4 w-full`}
								onClick={() => {
									setSelectedPlayerId(bet.player_id);
									setIsProfileDialogOpen(true);
								}}
							>
								<div>
									<p
										className={`text-lg font-semibold text-left`}
									>
										{getPlayerName(bet.player_id)}
									</p>
									<p className={`text-sm text-left`}>
										<span
											className={`text-muted-foreground`}
										>
											{bet.amount.toLocaleString()}{" "}
											PTS{" "}
										</span>
										<span
											className={`text-sm text-right ${prediction.winning_option_id === bet.option_id ? "text-win" : "text-loss"}`}
										>
											on {bet.option?.label ?? "Unknown"}
										</span>
									</p>
								</div>
								<div className={`flex flex-col items-end`}>
									{bet.payout !== null && (
										<p
											className={`text-lg font-semibold ${bet.payout - bet.amount > 0 ? "text-win" : "text-loss"}`}
										>
											{bet.payout - bet.amount > 0
												? "+"
												: ""}
											{(
												bet.payout - bet.amount
											).toLocaleString()}{" "}
											PTS
										</p>
									)}
								</div>
							</button>
						))}
					</FadeContent>
				)}
			</div>

			<PlayerProfileDialog
				playerId={selectedPlayerId}
				open={isProfileDialogOpen}
				onOpenChange={setIsProfileDialogOpen}
				roomId={room.id}
			/>
		</div>
	);
}

export default ResolvedPhase;
