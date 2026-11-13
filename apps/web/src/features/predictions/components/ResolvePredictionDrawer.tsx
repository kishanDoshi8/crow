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
					<DrawerTitle>Reveal Results</DrawerTitle>
					<DrawerDescription>
						<span className='block'>{prediction.title}</span>
						<span className='block mt-1'>
							Choose the winning option.
						</span>
						<RadioGroup
							className={`w-full mt-4`}
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
					</DrawerDescription>
				</DrawerHeader>
				<DrawerFooter className={`gap-3`}>
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
								No Result
							</Button>
						</CloseWithoutResultDialog>
						<CloseWithoutResultDialog
							mode='cancel'
							predictionId={prediction.id}
							roomId={roomId}
							onSuccess={handleClosed}
						>
							<Button variant='outline' size='lg'>
								Cancel prediction
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
		body: "Use this when the event happened but can't be settled, e.g. a washed-out match.",
		confirm: "Confirm No Result",
		success: "Prediction ended with no result.",
		failure: "Failed to end prediction with no result.",
	},
	cancel: {
		title: "Cancel this prediction?",
		body: "Use this for a mistake or an event that won't happen. It's removed from play.",
		confirm: "Cancel prediction",
		success: "Prediction cancelled. Everyone's points are back.",
		failure: "Failed to cancel the prediction.",
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
							All bets are returned and no one wins or loses
							points.
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
					toast.error("Failed to reveal results.", {
						description: error.message,
						dismissible: true,
						duration: 7000,
						position: "top-center",
					});
				},
				onSuccess: () => {
					toast.success("Results revealed successfully!", {
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
					Reveal Results
				</Button>
			</DialogTrigger>
			<DialogContent className={`sm:max-w-md mx-auto`}>
				<DialogHeader>
					<DialogTitle>Are you sure?</DialogTitle>
					<DialogDescription>
						Are you sure you want to reveal the results? This action
						cannot be undone.
						<Alert className={`mt-4`}>
							<InfoIcon />
							<AlertTitle>Selected Option: {selectedLabel}</AlertTitle>
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
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
