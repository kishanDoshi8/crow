import { useParams } from "react-router-dom";
import { usePrediction } from "@/features/predictions/hooks/prediction";
import { PredictionView } from "@/features/predictions/view/PredictionView";
import { useRoomContext } from "@/shared/lib/roomContext";

// A prediction, in whichever state it's in. When an open prediction's
// deadline passes, refetch so the page moves on to locked.
export function PredictionPage() {
	const { predictionId } = useParams<{ predictionId: string }>();
	const { room } = useRoomContext();
	const {
		data: prediction,
		isPending,
		refetch,
	} = usePrediction(room.id, predictionId);

	return (
		<PredictionView
			prediction={prediction}
			isLoading={isPending}
			onDeadline={() => void refetch()}
		/>
	);
}
