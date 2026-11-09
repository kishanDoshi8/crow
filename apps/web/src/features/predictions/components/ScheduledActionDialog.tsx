import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Spinner,
} from "@/shared/ui";
import {
	useDeleteScheduledPrediction,
	usePublishPredictionNow,
} from "@/features/predictions/hooks/prediction";

const COPY = {
	publish: {
		title: "Put it live now?",
		body: "Everyone in the room can see it and pick straight away, and they're notified.",
		confirm: "Go live now",
		success: "It's live.",
		failure: "Couldn't put it live.",
	},
	delete: {
		title: "Delete this prediction?",
		body: "Nobody has seen it yet. This can't be undone.",
		confirm: "Delete",
		success: "Scheduled prediction deleted.",
		failure: "Couldn't delete it.",
	},
} as const;

type Props = {
	mode: keyof typeof COPY;
	roomId: string;
	predictionId: string;
	title: string;
	// The button that opens it.
	children: ReactNode;
	onDone?: () => void;
};

// Confirms an organizer's action on a scheduled prediction: putting it live
// early, or deleting it.
export function ScheduledActionDialog({
	mode,
	roomId,
	predictionId,
	title,
	children,
	onDone,
}: Readonly<Props>) {
	const [open, setOpen] = useState(false);
	const publish = usePublishPredictionNow();
	const remove = useDeleteScheduledPrediction();
	const { mutate, isPending } = mode === "publish" ? publish : remove;
	const copy = COPY[mode];

	const handleConfirm = () => {
		mutate(
			{ roomId, predictionId },
			{
				onSuccess: () => {
					setOpen(false);
					onDone?.();
					toast.success(copy.success, { position: "top-center" });
				},
				onError: (error) => {
					toast.error(copy.failure, {
						description: error.message,
						position: "top-center",
					});
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className='mx-auto sm:max-w-md' onOpenAutoFocus={(e) => e.preventDefault()}>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>
						<span className='line-clamp-2 font-medium text-foreground'>{title}</span>
						<span className='mt-2 block'>{copy.body}</span>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className='mt-2 gap-3'>
					<DialogClose asChild>
						<Button variant='outline' size='lg' disabled={isPending}>
							Back
						</Button>
					</DialogClose>
					<Button
						variant={mode === "delete" ? "destructive" : "linear"}
						size='lg'
						onClick={handleConfirm}
						disabled={isPending}
					>
						{isPending ? <Spinner /> : null}
						{copy.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
