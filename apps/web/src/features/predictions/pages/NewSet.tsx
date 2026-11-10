import { toast } from "sonner";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { PredictionSetForm } from "@/features/predictions/components/PredictionSetForm";
import { useCreatePredictions } from "@/features/predictions/hooks/prediction";
import { useRoomRole } from "@/features/rooms";
import { useCurrentSeries } from "@/features/series";
import { describeDeadline } from "@/shared/lib/deadline";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useRoomContext } from "@/shared/lib/roomContext";

// Organizers write several predictions at once (every question for a match,
// say): one form, one notification to members.
export default function PredictionNewSet() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const location = useLocation();
	const navigate = useNavigate();
	const { back } = useAppNavigation();
	const navigationState = location.state as {
		seriesId?: string;
		goLive?: "now" | "later";
	} | null;
	const { mutate: createPredictions, isPending } = useCreatePredictions();
	const { currentSeries, hasActiveSeries, isPending: isSeriesLoading } =
		useCurrentSeries(room.id);
	const single = `/rooms/${room.code}/predictions/new`;

	if (!can.organize) {
		return <Navigate to={`/rooms/${room.code}`} replace />;
	}

	// The one-prediction page explains how to start a series.
	if (!isSeriesLoading && !hasActiveSeries) {
		return <Navigate to={single} replace state={location.state} />;
	}

	return (
		<PredictionSetForm
			roomId={room.id}
			initialSeriesId={
				navigationState?.seriesId ??
				(currentSeries?.status === "active" ? currentSeries.id : null)
			}
			initialGoLive={navigationState?.goLive}
			isSubmitting={isPending}
			onSubmit={(values) =>
				createPredictions(
					{ roomId: room.id, ...values },
					{
						onSuccess: ({ count }) => {
							const predictions = `${count} ${count === 1 ? "prediction" : "predictions"}`;
							if (values.opensAt) {
								toast.success(
									`${predictions} scheduled for ${describeDeadline(values.opensAt).when}`,
									{
										description: "They're in Needs you until they go live.",
										position: "top-center",
									},
								);
							} else {
								toast.success(`${predictions} live`, {
									description: "Members got one notification for the set.",
									position: "top-center",
								});
							}
							back(`/rooms/${room.code}`);
						},
						onError: (error) => {
							toast.error("Couldn't create the predictions.", {
								description: error.message,
								position: "top-center",
							});
						},
					},
				)
			}
			onCancel={() => back(`/rooms/${room.code}`)}
			// Swaps the form in place, so Back still leaves the way it came in.
			onCreateOne={() => navigate(single, { replace: true, state: location.state })}
		/>
	);
}
