import { FadeContent, Skeleton } from "@/shared/ui";
import { useBets } from "@/features/predictions/hooks/bet";
import type { Prediction } from "@/features/predictions/types/types";
import { CoinsIcon, UsersIcon } from "lucide-react";

type Props = {
	prediction: Prediction | null | undefined;
	fadeDelay?: number;
};

const PredictionData = ({ prediction, fadeDelay }: Props) => {
	const { data: bets, isLoading: isBetsLoading } = useBets(
		prediction?.room_id ?? "",
		prediction?.id ?? "",
	);
	return (
		<>
			{prediction?.prediction_options && !isBetsLoading ? (
				<FadeContent
					delay={fadeDelay}
					className={`flex justify-center items-center gap-4 text-sm`}
				>
					{/* total pooled */}
					<p className={`flex gap-2 items-center`}>
						<CoinsIcon className={`w-3 h-3 text-rank-1`} />
						{bets
							?.reduce((acc, bet) => acc + bet.amount, 0)
							.toLocaleString()}{" "}
						<span className={`text-muted-foreground`}>pool</span>
					</p>
					{/* total bets */}
					<p className={`flex gap-2 items-center`}>
						<UsersIcon className={`w-3 h-3 text-primary`} />{" "}
						{bets ? (
							<span>
								{bets.length}{" "}
								<span className={`text-muted-foreground`}>
									{bets.length === 1 ? "bet" : "bets"}
								</span>
							</span>
						) : (
							<span>
								0{" "}
								<span className={`text-muted-foreground`}>
									bets
								</span>
							</span>
						)}
					</p>
				</FadeContent>
			) : (
				<Skeleton className={`h-5 w-36 mx-auto`} />
			)}
		</>
	);
};

export default PredictionData;
