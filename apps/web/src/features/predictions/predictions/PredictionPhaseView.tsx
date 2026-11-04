import DraftPhase from "@/features/predictions/predictions/DraftPhase";
import type { Prediction } from "@/features/predictions/types/types";
import LockedPhase from "./LockedPhase";
import ResolvedPhase from "./ResolvedPhase";
import NoResult from "./NoResult";

type Props = {
	prediction: Prediction | null | undefined;
	isLoading: boolean;
	refetchPrediction: () => void;
	selectedOption: string | null;
	setSelectedOption: React.Dispatch<React.SetStateAction<string | null>>;
};

export function PredictionPhaseView(props: Readonly<Props>) {
	const { prediction, isLoading } = props;

	if (!prediction && !isLoading) {
		return (
			<div
				className={`flex flex-col gap-4 justify-center items-center mt-4`}
			>
				<p className={`text-muted-foreground text-center`}>
					No active prediction. Please wait for the host to start a
					new prediction.
				</p>
			</div>
		);
	}

	if (prediction?.status === "draft" || isLoading) {
		return <DraftPhase {...props} />;
	} else if (prediction?.status === "locked") {
		return <LockedPhase {...props} />;
	} else if (prediction?.status === "revealed") {
		return <ResolvedPhase {...props} />;
	} else if (!isLoading) {
		return <NoResult {...props} />; // update this to a loading component
	}
}
