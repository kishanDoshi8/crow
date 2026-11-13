import { NoResultReasonField } from "@/features/predictions/components/NoResultReasonField";
import {
	Alert,
	AlertDescription,
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
import { useCorrectPrediction } from "@/features/predictions/hooks/prediction";
import type { Prediction } from "@/features/predictions/types/types";
import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const NO_RESULT = "no_result";

type CorrectablePrediction = Pick<
	Prediction,
	| "id"
	| "title"
	| "status"
	| "winning_option_id"
	| "prediction_options"
	| "ratings_reversible"
	| "seriesStatus"
>;

// Organizers can fix a revealed or no-result prediction while its series runs.
export function canCorrectResult(
	prediction: CorrectablePrediction,
	canOrganize: boolean,
) {
	if (!canOrganize || prediction.seriesStatus !== "active") return false;
	if (prediction.status === "no_result") return true;
	return (
		prediction.status === "revealed" && prediction.ratings_reversible !== false
	);
}

type CorrectResultDrawerProps = {
	prediction: CorrectablePrediction;
	roomId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function CorrectResultDrawer({
	prediction,
	roomId,
	open,
	onOpenChange,
}: Readonly<CorrectResultDrawerProps>) {
	const { mutate: correctResult, isPending } = useCorrectPrediction();
	const [selected, setSelected] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [confirmOpen, setConfirmOpen] = useState(false);

	const current =
		prediction.status === "no_result"
			? NO_RESULT
			: prediction.winning_option_id;
	const selectedLabel =
		selected === NO_RESULT
			? "No result"
			: (prediction.prediction_options.find((o) => o.id === selected)
					?.label ?? null);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSelected(null);
			setReason("");
		}
		onOpenChange(nextOpen);
	};

	const handleConfirm = () => {
		if (!selected) return;
		correctResult(
			selected === NO_RESULT
				? {
						predictionId: prediction.id,
						roomId,
						outcome: "no_result",
						noResultReason: reason.trim() || null,
					}
				: {
						predictionId: prediction.id,
						roomId,
						outcome: "win",
						winningOptionId: selected,
					},
			{
				onSuccess: () => {
					setConfirmOpen(false);
					handleOpenChange(false);
					toast.success("Result corrected. Points are updated.", {
						position: "top-center",
					});
				},
				onError: (error) => {
					toast.error("Couldn't correct the result.", {
						description: error.message,
						duration: Infinity,
						dismissible: true,
						position: "top-center",
					});
				},
			},
		);
	};

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerContent className='sm:max-w-md mx-auto'>
				<DrawerHeader>
					<DrawerTitle>Correct result</DrawerTitle>
					<DrawerDescription>
						<span className='block'>{prediction.title}</span>
						<span className='block mt-1'>
							Pick the right result. Points, ratings and streaks are
							worked out again for everyone who bet.
						</span>
					</DrawerDescription>
				</DrawerHeader>
				<div className='px-4'>
					<RadioGroup
						className='w-full'
						value={selected}
						onValueChange={setSelected}
					>
						{[
							...prediction.prediction_options.map((option) => ({
								id: option.id,
								label: option.label,
							})),
							{ id: NO_RESULT, label: "No result (refund everyone)" },
						].map((choice) => (
							<FieldLabel
								key={choice.id}
								className={`flex items-center gap-2 ${choice.id === current ? "opacity-60" : "cursor-pointer"}`}
							>
								<Field orientation='horizontal'>
									<RadioGroupItem
										value={choice.id}
										id={`correct-${choice.id}`}
										disabled={choice.id === current}
									/>
									<FieldContent>
										<FieldTitle>
											<span>{choice.label}</span>
											{choice.id === current ? (
												<span className='text-muted-foreground font-normal'>
													(current)
												</span>
											) : null}
										</FieldTitle>
									</FieldContent>
								</Field>
							</FieldLabel>
						))}
					</RadioGroup>
					{selected === NO_RESULT ? (
						<NoResultReasonField value={reason} onChange={setReason} className='mt-4' />
					) : null}
				</div>
				<DrawerFooter className='gap-3'>
					<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
						<Button
							variant='linear'
							size='lg'
							className='w-full'
							disabled={!selected}
							onClick={() => setConfirmOpen(true)}
						>
							Correct result
						</Button>
						<DialogContent className='sm:max-w-md mx-auto'>
							<DialogHeader>
								<DialogTitle>Change the result?</DialogTitle>
								<DialogDescription>
									The result becomes{" "}
									<span className='font-medium text-foreground'>
										{selectedLabel}
									</span>
									.
									<Alert className='mt-4'>
										<InfoIcon />
										<AlertDescription>
											Everyone who bet sees their points change,
											and the room feed shows the correction.
										</AlertDescription>
									</Alert>
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className='gap-4'>
								<DialogClose asChild>
									<Button variant='outline' size='lg' disabled={isPending}>
										Back
									</Button>
								</DialogClose>
								<Button size='lg' onClick={handleConfirm} disabled={isPending}>
									{isPending && <Spinner />}
									Confirm
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
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
