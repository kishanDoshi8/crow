import { Button } from "@/shared/ui/button";
import { useAppNavigation } from "@/shared/lib/navigation";
import { toast } from "sonner";
import { useCreatePrediction, usePrediction } from "@/features/predictions/hooks/prediction";
import { CopyPredictionSheet } from "@/features/predictions/components/CopyPredictionSheet";
import { Skeleton } from "@/shared/ui";
import { useState } from "react";
import { PredictionForm } from "@/features/predictions/components/PredictionForm";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useCurrentSeries } from "@/features/series";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useRoomRole } from "@/features/rooms";
import { describeDeadline } from "@/shared/lib/deadline";

export default function PredictionNew() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const location = useLocation();
	const navigationState = location.state as {
		seriesId?: string;
		// "later" when opened to schedule one (from Needs you).
		goLive?: "now" | "later";
		// A prediction to start from ("Duplicate").
		copyFrom?: string;
	} | null;
	// The past prediction this one starts from, if any: its question,
	// options, details and tags fill the form; the deadline is picked fresh.
	const [copyFromId, setCopyFromId] = useState(navigationState?.copyFrom ?? null);
	const [isCopyOpen, setIsCopyOpen] = useState(false);
	const { data: template, isPending: isTemplateLoading } = usePrediction(
		room.id,
		copyFromId ?? undefined,
	);
	const { mutate: createPrediction, isPending: isLoading } =
		useCreatePrediction();
	const { back } = useAppNavigation();
	const { currentSeries, hasActiveSeries, isPending: isSeriesLoading } =
		useCurrentSeries(room?.id);

	if (!can.organize) {
		return <Navigate to={`/rooms/${room.code}`} replace />;
	}

	if (!isSeriesLoading && !hasActiveSeries) {
		return (
			<div className={`p-4`}>
				<div
					className={`w-full max-w-md mx-auto flex flex-col gap-3 rounded-xl border p-5`}
				>
					<h3 className={`text-xl font-bold`}>Start a series first</h3>
					<p className={`text-sm text-muted-foreground`}>
						Every prediction is part of a series, and points live in
						the series. Start one, then add predictions to it.
					</p>
					<Button variant='linear' asChild>
						<Link to={`/rooms/${room.code}/series/new`}>
							Start a series
						</Link>
					</Button>
				</div>
			</div>
		);
	}

	if (copyFromId && isTemplateLoading) {
		return (
			<div className='mx-auto w-full max-w-md space-y-4 p-4'>
				<Skeleton className='h-14 w-full rounded-xl' />
				<Skeleton className='h-24 w-full rounded-xl' />
				<Skeleton className='h-40 w-full rounded-xl' />
			</div>
		);
	}

	const initial = template
		? {
				title: template.title,
				options: [...template.prediction_options]
					.sort((a, b) => a.display_order - b.display_order)
					.map((option) => option.label),
				description: template.description ?? "",
				tags: (template.tags ?? []).map((tag) => tag.tag),
			}
		: undefined;

	return (
		<>
			<PredictionForm
				// A new copy starts the form over.
				key={template?.id ?? "blank"}
				mode='create'
				roomId={room.id}
				initial={initial}
				onCopyPast={() => setIsCopyOpen(true)}
				// Every prediction belongs to a series: default to the one the player is looking at.
				initialSeriesId={
					navigationState?.seriesId ??
					(currentSeries?.status === "active" ? currentSeries.id : null)
				}
				initialGoLive={navigationState?.goLive}
				isSubmitting={isLoading}
				onSubmit={({ title, options, deadline, opensAt, seriesId, description, tags }) =>
					createPrediction(
						{
							roomId: room?.id || "",
							title,
							options,
							deadline,
							opensAt,
							seriesId,
							description,
							tags,
						},
						{
							// Back to wherever the form was opened from.
							onSuccess: () => {
								// Scheduled ones are out of sight until they go live: say
								// where to find them.
								if (opensAt) {
									toast.success(`Scheduled for ${describeDeadline(opensAt).when}`, {
										description: "It's in Needs you until it goes live.",
										position: "top-center",
									});
								}
								back(`/rooms/${room.code}`);
							},
							onError: (error) => {
								toast("Failed to create prediction.", {
									description: error.message,
								});
							},
						},
					)
				}
				onCancel={() => back(`/rooms/${room.code}`)}
			/>
			<CopyPredictionSheet
				roomId={room.id}
				open={isCopyOpen}
				onOpenChange={setIsCopyOpen}
				onPick={(predictionId) => {
					setIsCopyOpen(false);
					setCopyFromId(predictionId);
				}}
			/>
		</>
	);
}
