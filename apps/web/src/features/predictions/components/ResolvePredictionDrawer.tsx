import { NoResultReasonField } from "@/features/predictions/components/NoResultReasonField";
import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	Field,
	FieldContent,
	FieldLabel,
	FieldTitle,
	RadioGroup,
	RadioGroupItem,
	Spinner,
} from "@/shared/ui";
import { useResolvePrediction } from "@/features/predictions/hooks/prediction";
import type { Prediction } from "@/features/predictions/types/types";
import { InfoIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

type ResolvePrediction = ReturnType<typeof useResolvePrediction>["mutate"];

type ResolvePredictionDrawerProps = {
	prediction: Pick<Prediction, "id" | "title" | "prediction_options">;
	roomId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// Every way staff close a locked prediction: reveal the winner, mark no
// result, or cancel it. Used on the prediction page and the Manage page.
export function ResolvePredictionDrawer({
	prediction,
	roomId,
	open,
	onOpenChange,
}: Readonly<ResolvePredictionDrawerProps>) {
	const { mutate: resolvePrediction, isPending } = useResolvePrediction();
	const [selectedOption, setSelectedOption] = useState<string | null>(null);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSelectedOption(null);
		}
		onOpenChange(nextOpen);
	};
	const handleClosed = () => handleOpenChange(false);

	const selectedLabel =
		prediction.prediction_options.find((o) => o.id === selectedOption)
			?.label ?? null;

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerContent className={`sm:max-w-md mx-auto`}>
				<DrawerHeader>
					<DrawerTitle>Reveal result</DrawerTitle>
					<DrawerDescription>
						<span className='block'>{prediction.title}</span>
						<span className='block mt-1'>
							Choose the winning option.
						</span>
					</DrawerDescription>
				</DrawerHeader>
				{/* Options scroll on their own, so with many of them the buttons
				    below stay in reach. */}
				<div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4'>
					<RadioGroup
						className='w-full'
						value={selectedOption}
						onValueChange={setSelectedOption}
					>
						{prediction.prediction_options.map((option) => (
							<FieldLabel
								key={option.id}
								className={`flex items-center gap-2 cursor-pointer`}
							>
								<Field orientation={"horizontal"}>
									<RadioGroupItem
										value={option.id}
										id={option.id}
									/>
									<FieldContent>
										<FieldTitle>
											<span>{option.label}</span>
										</FieldTitle>
									</FieldContent>
								</Field>
							</FieldLabel>
						))}
					</RadioGroup>
				</div>
				<DrawerFooter className='gap-3 border-t'>
					<RevealResults
						predictionId={prediction.id}
						roomId={roomId}
						selectedOption={selectedOption}
						selectedLabel={selectedLabel}
						resolvePrediction={resolvePrediction}
						isPending={isPending}
						onSuccess={handleClosed}
					/>
					<div className='grid grid-cols-2 gap-3'>
						<CloseWithoutResultDialog
							mode='no_result'
							predictionId={prediction.id}
							roomId={roomId}
							onSuccess={handleClosed}
						>
							<Button variant='secondary' size='lg'>
								No result
							</Button>
						</CloseWithoutResultDialog>
						<CloseWithoutResultDialog
							mode='cancel'
							predictionId={prediction.id}
							roomId={roomId}
							onSuccess={handleClosed}
						>
							<Button variant='outline' size='lg'>
								Scrap question
							</Button>
						</CloseWithoutResultDialog>
					</div>
					<DrawerClose asChild>
						<Button variant='ghost' size='lg'>
							Back
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

const CLOSE_COPY = {
	no_result: {
		title: "End with no result?",
		body: "Use this when the event happened but can't be decided, e.g. a washed-out match.",
		confirm: "End with no result",
		success: "Question ended with no result. Everyone's points are back.",
		failure: "Couldn't end the question with no result. Try again.",
	},
	cancel: {
		title: "Scrap this question?",
		body: "Use this for a mistake or an event that won't happen. It's removed from play.",
		confirm: "Scrap question",
		success: "Question scrapped. Everyone's points are back.",
		failure: "Couldn't scrap the question. Try again.",
	},
} as const;

type CloseWithoutResultDialogProps = {
	mode: keyof typeof CLOSE_COPY;
	predictionId: string;
	roomId: string;
	// The trigger, e.g. a button.
	children: ReactNode;
	onSuccess?: () => void;
};

// Ends a prediction without a winner and refunds every bet. "cancel" also
// works on predictions still open for picks.
export function CloseWithoutResultDialog({
	mode,
	predictionId,
	roomId,
	children,
	onSuccess,
}: Readonly<CloseWithoutResultDialogProps>) {
	const { mutate: resolvePrediction, isPending } = useResolvePrediction();
	const [reason, setReason] = useState("");
	const [open, setOpen] = useState(false);
	const copy = CLOSE_COPY[mode];

	const handleConfirm = () => {
		resolvePrediction(
			{
				predictionId,
				outcome: mode,
				roomId,
				noResultReason: reason.trim() || null,
			},
			{
				onSuccess: () => {
					setOpen(false);
					setReason("");
					onSuccess?.();
					setTimeout(() => {
						toast.success(copy.success, {
							dismissible: true,
							duration: 5000,
							position: "top-center",
						});
					}, 500);
				},
				onError: (error) => {
					toast.error(copy.failure, {
						description: error.message,
						dismissible: true,
						duration: Infinity,
						position: "top-center",
					});
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent
				className={`sm:max-w-md mx-auto`}
				onOpenAutoFocus={(e) => {
					e.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>
						{copy.body} This can't be undone.
					</DialogDescription>
					{/* Outside the description: it renders a <p>, which can't hold the alert. */}
					<Alert className={`mt-2`}>
						<InfoIcon />
						<AlertDescription>
							Everyone gets their points back, and nobody wins or
							loses.
						</AlertDescription>
					</Alert>
				</DialogHeader>
				<NoResultReasonField value={reason} onChange={setReason} />
				<DialogFooter className={`gap-4 mt-4`}>
					<DialogClose asChild>
						<Button variant='outline' size='lg' disabled={isPending}>
							Back
						</Button>
					</DialogClose>
					<Button
						variant='destructive'
						size='lg'
						onClick={handleConfirm}
						disabled={isPending}
					>
						{isPending && <Spinner />}
						{copy.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RevealResults({
	predictionId,
	roomId,
	selectedOption,
	selectedLabel,
	resolvePrediction,
	isPending,
	onSuccess,
}: Readonly<{
	predictionId: string;
	roomId: string;
	selectedOption: string | null;
	selectedLabel: string | null;
	resolvePrediction: ResolvePrediction;
	isPending: boolean;
	onSuccess: () => void;
}>) {
	const [open, setOpen] = useState(false);

	const handleReveal = () => {
		if (!selectedOption) {
			return;
		}
		resolvePrediction(
			{
				predictionId,
				outcome: "win",
				winningOptionId: selectedOption,
				roomId,
			},
			{
				onError: (error) => {
					toast.error("Couldn't reveal the result. Try again.", {
						description: error.message,
						dismissible: true,
						duration: 7000,
						position: "top-center",
					});
				},
				onSuccess: () => {
					toast.success("Result revealed.", {
						dismissible: true,
						duration: 5000,
						position: "top-center",
					});
					setOpen(false);
					onSuccess();
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={"linear"}
					className={`w-full`}
					size='lg'
					disabled={!selectedOption}
				>
					Reveal result
				</Button>
			</DialogTrigger>
			<DialogContent className={`sm:max-w-md mx-auto`}>
				<DialogHeader>
					<DialogTitle>Reveal this result?</DialogTitle>
					<DialogDescription>
						Points move straight away.
						<Alert className={`mt-4`}>
							<InfoIcon />
							<AlertTitle>Winner: {selectedLabel}</AlertTitle>
						</Alert>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className={`gap-4`}>
					<DialogClose asChild>
						<Button variant='outline' size='lg'>
							Back
						</Button>
					</DialogClose>
					<Button size='lg' onClick={handleReveal} disabled={isPending}>
						{isPending && <Spinner />}
						Reveal result
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
