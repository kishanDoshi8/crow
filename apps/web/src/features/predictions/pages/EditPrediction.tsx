import { useRoomContext } from "@/app/layouts/RoomLayout";
import { useAppNavigation } from "@/shared/lib/navigation";
import { usePrediction, useUpdatePrediction } from "@/features/predictions/hooks/prediction";
import { PredictionForm } from "@/features/predictions/components/PredictionForm";
import { useRoomRole } from "@/features/rooms";
import { Skeleton } from "@/shared/ui";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";

// Organizers fix a prediction while it's open for picks: the question, the
// deadline, and the options until someone bets.
export default function EditPrediction() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { predictionId } = useParams<{ predictionId: string }>();
	const { back } = useAppNavigation();
	const { data: prediction, isPending } = usePrediction(room.id, predictionId);
	const { mutate: updatePrediction, isPending: isSaving } =
		useUpdatePrediction();
	const predictionPath = `/rooms/${room.code}/predictions/${predictionId}`;

	if (!can.organize) {
		return <Navigate to={predictionPath} replace />;
	}

	if (isPending) {
		return (
			<div className='mx-auto w-full max-w-md space-y-4 p-4'>
				<Skeleton className='h-24 w-full rounded-xl' />
				<Skeleton className='h-40 w-full rounded-xl' />
			</div>
		);
	}

	// Once picks close there's nothing left to edit.
	if (!prediction || prediction.status !== "draft") {
		return <Navigate to={predictionPath} replace />;
	}

	const options = [...prediction.prediction_options].sort(
		(a, b) => a.display_order - b.display_order,
	);
	const optionsLocked = options.some((option) => option.total_bet > 0);

	return (
		<PredictionForm
			mode='edit'
			roomId={room.id}
			initial={{
				title: prediction.title,
				options: options.map((option) => option.label),
				deadline: new Date(prediction.deadline),
				description: prediction.description ?? "",
				tags: (prediction.tags ?? []).map((tag) => tag.tag),
			}}
			optionsLocked={optionsLocked}
			isSubmitting={isSaving}
			onSubmit={({ title, options: labels, deadline, description, tags }) =>
				updatePrediction(
					{
						roomId: room.id,
						predictionId: prediction.id,
						title,
						deadline,
						options: optionsLocked ? undefined : labels,
						description,
						tags,
					},
					{
						onSuccess: () => {
							toast.success("Prediction updated.", {
								position: "top-center",
							});
							back(predictionPath);
						},
						onError: (error) => {
							toast.error("Couldn't update the prediction.", {
								description: error.message,
								position: "top-center",
							});
						},
					},
				)
			}
			onCancel={() => back(predictionPath)}
		/>
	);
}
