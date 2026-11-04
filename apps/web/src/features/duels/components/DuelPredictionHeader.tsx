import { Alert, AlertAction, AlertDescription, Button } from "@/shared/ui";
import type { Room } from "@/features/rooms";
import type { Prediction } from "@/features/predictions";
import { ChevronRightIcon, ZapIcon } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
	room: Room | null | undefined;
	prediction: Prediction | null | undefined;
};

export default function DuelPredictionHeader({
	room,
	prediction,
}: Readonly<Props>) {
	if (!prediction || !room) {
		return (
			<Alert variant={"info"}>
				<ZapIcon className='text-accent' />
				<AlertDescription>
					Prediction{" "}
					<span className='font-semibold text-foreground'>
						loading prediction...
					</span>
				</AlertDescription>
			</Alert>
		);
	}
	return (
		<Link to={`/rooms/${room.code}/predictions/${prediction.id}`} replace>
			<Alert variant={"info"}>
				<ZapIcon className='text-accent' />
				<AlertDescription>
					Prediction{" "}
					<span className='font-semibold text-foreground'>
						{prediction.title}
					</span>
				</AlertDescription>
				<AlertAction>
					<Button variant='ghost' size='icon-lg' className='p-0'>
						<ChevronRightIcon className='size-5 text-activity/70' />
					</Button>
				</AlertAction>
			</Alert>
		</Link>
	);
}
