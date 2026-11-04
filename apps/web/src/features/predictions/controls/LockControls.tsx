import { useRoomRole } from "@/features/rooms";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Button } from "@/shared/ui";
import { ResolvePredictionDrawer } from "@/features/predictions/components/ResolvePredictionDrawer";
import { useState } from "react";
import type { Prediction } from "@/features/predictions/types/types";

type LockControlsProps = {
	prediction: Prediction;
};

export default function LockControls({
	prediction,
}: Readonly<LockControlsProps>) {
	const { room } = useRoomContext();
	const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
	const canResolve = useRoomRole(room).can.resolve;

	if (!canResolve || prediction.status !== "locked") {
		return null;
	}

	return (
		<div
			className={`sticky bottom-2 left-0 right-0 p-4 flex bg-background/45 w-full max-w-2xs mx-auto rounded-lg `}
		>
			<Button
				variant={"linear"}
				className={`w-full`}
				size='lg'
				onClick={() => setIsDrawerOpen(true)}
			>
				Reveal Results
			</Button>
			<ResolvePredictionDrawer
				prediction={prediction}
				roomId={room.id}
				open={isDrawerOpen}
				onOpenChange={setIsDrawerOpen}
			/>
		</div>
	);
}
