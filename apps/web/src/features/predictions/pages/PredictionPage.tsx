import { usePrediction } from "@/features/predictions/hooks/prediction";
import { PredictionPhaseView } from "@/features/predictions/predictions/PredictionPhaseView";
import { useState } from "react";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Link, useParams } from "react-router-dom";

// // ============================================================
// // PredictionPage
// // Bootstraps session, loads room state, starts Realtime,
// // triggers weekly claim check.
// // ============================================================

export function PredictionPage() {
	const { predictionId } = useParams<{ predictionId: string }>();
	const { room } = useRoomContext();
	const {
		data: prediction,
		isPending: isPredictionLoading,
		refetch: refetchPrediction,
	} = usePrediction(room.id, predictionId);
	const [selectedOption, setSelectedOption] = useState<string | null>(null);

	if (!room) return null; // This should never happen because RoomLayout already checks for room and redirects to 404 if not found

	return (
		<div>
			<div className={`p-4`}>
				{prediction?.seriesTitle ? (
					<Link
						to={`/rooms/${room.code}/series/${prediction.seriesId}`}
						className='block max-w-md mx-auto mb-2 text-xs text-muted-foreground hover:text-foreground'
					>
						{prediction.seriesTitle}
						{prediction.seriesPredictionNumber
							? ` · #${prediction.seriesPredictionNumber}`
							: ""}
					</Link>
				) : null}
				<PredictionPhaseView
					isLoading={isPredictionLoading}
					prediction={prediction}
					refetchPrediction={refetchPrediction}
					selectedOption={selectedOption}
					setSelectedOption={setSelectedOption}
				/>
			</div>
		</div>
	);
}
