import type { Prediction } from "@/features/predictions/types/types";
import PredictionOptions from "../widgets/PredictionOptions";
import PredictionTitle from "../components/PredictionTitle";
import { BetListSkeleton } from "../components/BetListSkeleton";
import { ResolvedByLine } from "../components/ResolvedByLine";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui";
import { InfoIcon } from "lucide-react";
import { useBets } from "@/features/predictions/hooks/bet";
import { useOptionColor } from "@/shared/hooks/useOptionColor";
import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";

type Props = {
	prediction: Prediction | null | undefined;
};

function NoResult({ prediction }: Readonly<Props>) {
	const { data: bets, isLoading: isBetsLoading } = useBets(
		prediction?.room_id ?? "",
		prediction?.id ?? "",
	);
	const { room } = useRoomContext();
	const { data: player } = usePlayer();

	const getPlayerName = (playerId: string) => {
		if (player?.id === playerId) {
			return player.username + " (You)";
		}
		const member = room.members.find((m) => m.player_id === playerId);
		return member ? member.player.username : "Unknown";
	};

	return (
		<div className={`flex-1 flex flex-col gap-4 items-center pb-4 mt-4`}>
			<Alert className={`mb-4 border-primary w-full max-w-md mx-auto`}>
				<InfoIcon />
				<AlertTitle>
					{prediction?.status === "cancelled" ? "Cancelled" : "No Result"}
				</AlertTitle>
				<AlertDescription className={`text-secondary-foreground `}>
					{prediction?.no_result_reason ??
						"All bets have been returned."}
					{prediction ? <ResolvedByLine prediction={prediction} /> : null}
				</AlertDescription>
			</Alert>

			<div
				className={`border border-border rounded-xl p-4 flex flex-col gap-2 bg-secondary/30 w-full transition-colors`}
			>
				<PredictionTitle prediction={prediction} />

				<PredictionOptions
					prediction={prediction}
					selectedOption={null}
					setSelectedOption={() => {}}
				/>
			</div>

			<div
				className={`max-w-md w-full mx-auto mt-4 p-4 border rounded-lg bg-secondary/50`}
			>
				<div className={`flex mb-2`}>
					<p className={`text-xl`}>Who bet what?</p>
				</div>
				{isBetsLoading ? (
					<BetListSkeleton layout='separate' />
				) : (
					<div>
						{bets?.map((bet) => (
							<div
								key={bet.id}
								className={`flex justify-between mt-2 border border-secondary hover:bg-accent p-4 rounded-xl`}
							>
								<div>
									<p>{getPlayerName(bet.player_id)}</p>
									<p>{}</p>
								</div>
								<div>
									<p>{bet.amount} PTS</p>
									<p
										className={`text-sm text-right ${useOptionColor(bet.option?.id ?? "")}`}
									>
										on {bet.option?.label ?? "Unknown"}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export default NoResult;
