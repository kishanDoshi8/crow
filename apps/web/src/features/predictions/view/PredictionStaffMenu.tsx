import { useState } from "react";
import { Link } from "react-router-dom";
import { BanIcon, MinusCircleIcon, MoreHorizontalIcon, PencilIcon, PencilLineIcon } from "lucide-react";
import {
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/shared/ui";
import type { Prediction } from "@/features/predictions/types/types";
import { CloseWithoutResultDialog } from "@/features/predictions/components/ResolvePredictionDrawer";
import {
	canCorrectResult,
	CorrectResultDrawer,
} from "@/features/predictions/components/CorrectResultDrawer";

type Props = {
	prediction: Prediction;
	roomId: string;
	roomCode: string;
	can: { resolve: boolean; organize: boolean };
};

const ITEM =
	"flex h-12 w-full items-center justify-start gap-3 rounded-lg px-3 text-[15px] font-medium";

// Staff tools for a prediction, in one place in every state: edit and cancel
// while it's open, no result or cancel once locked (revealing has its own
// button), correcting a result after it's settled.
export function PredictionStaffMenu({ prediction, roomId, roomCode, can }: Readonly<Props>) {
	const [open, setOpen] = useState(false);
	const [correcting, setCorrecting] = useState(false);
	const status = prediction.status;
	const close = () => setOpen(false);

	const canEdit = status === "draft" && can.organize;
	const canCancel = (status === "draft" || status === "locked") && can.resolve;
	const canNoResult = status === "locked" && can.resolve;
	const canCorrect = canCorrectResult(prediction, can.organize);

	if (!canEdit && !canCancel && !canNoResult && !canCorrect) return null;

	return (
		<>
			<Button
				variant='ghost'
				size='icon'
				className='-mr-2 size-11 shrink-0'
				aria-label='Manage prediction'
				onClick={() => setOpen(true)}
			>
				<MoreHorizontalIcon />
			</Button>
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent className='mx-auto sm:max-w-md'>
					<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
						<DrawerTitle>Manage prediction</DrawerTitle>
						<DrawerDescription className='line-clamp-2'>{prediction.title}</DrawerDescription>
					</DrawerHeader>
					<div className='flex flex-col gap-1 px-2 pb-6'>
						{canEdit ? (
							<Button variant='ghost' className={ITEM} asChild>
								<Link to={`/rooms/${roomCode}/predictions/${prediction.id}/edit`} onClick={close}>
									<PencilIcon className='size-5 text-muted-foreground' />
									Edit
								</Link>
							</Button>
						) : null}
						{canCorrect ? (
							<Button
								variant='ghost'
								className={ITEM}
								onClick={() => {
									close();
									setCorrecting(true);
								}}
							>
								<PencilLineIcon className='size-5 text-muted-foreground' />
								Correct result
							</Button>
						) : null}
						{canNoResult ? (
							<CloseWithoutResultDialog
								mode='no_result'
								predictionId={prediction.id}
								roomId={roomId}
								onSuccess={close}
							>
								<Button variant='ghost' className={ITEM}>
									<MinusCircleIcon className='size-5 text-muted-foreground' />
									End with no result
								</Button>
							</CloseWithoutResultDialog>
						) : null}
						{canCancel ? (
							<CloseWithoutResultDialog
								mode='cancel'
								predictionId={prediction.id}
								roomId={roomId}
								onSuccess={close}
							>
								<Button variant='ghost' className={`${ITEM} text-destructive`}>
									<BanIcon className='size-5' />
									Cancel prediction
								</Button>
							</CloseWithoutResultDialog>
						) : null}
					</div>
				</DrawerContent>
			</Drawer>
			{canCorrect ? (
				<CorrectResultDrawer
					prediction={prediction}
					roomId={roomId}
					open={correcting}
					onOpenChange={setCorrecting}
				/>
			) : null}
		</>
	);
}
