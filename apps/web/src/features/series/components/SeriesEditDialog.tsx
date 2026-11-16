import {
	Button,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	Input,
} from "@/shared/ui";
import { SeriesGamesField } from "@/features/series/components/SeriesGamesField";
import { Textarea } from "@/shared/ui/textarea";
import type { ChangeEvent } from "react";

export type SeriesFormState = {
	title: string;
	description: string;
	openEnded: boolean;
	expectedGames: string;
	startingStack: string;
	weeklyTopup: string;
	minBetsToRank: string;
};

type SeriesEditDialogProps = {
	open: boolean;
	isUpdatePending: boolean;
	// Points settings can't change once anyone has bet in the series.
	pointsLocked: boolean;
	// The ranking bar is fixed once a series is closed.
	rankingLocked: boolean;
	// Games already resolved, and still open, in this series.
	resolvedGames: number;
	openGames: number;
	formState: SeriesFormState;
	onOpenChange: (open: boolean) => void;
	onFormStateChange: (nextState: SeriesFormState) => void;
	onCancel: () => void;
	onSave: () => void;
};

export function SeriesEditDialog({
	open,
	isUpdatePending,
	pointsLocked,
	rankingLocked,
	resolvedGames,
	openGames,
	formState,
	onOpenChange,
	onFormStateChange,
	onCancel,
	onSave,
}: Readonly<SeriesEditDialogProps>) {
	const updateField =
		(field: Exclude<keyof SeriesFormState, "openEnded">) =>
		(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			onFormStateChange({
				...formState,
				[field]: event.target.value,
			});
		};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit series</DialogTitle>
				</DialogHeader>
				<div className='space-y-3'>
					<Input
						placeholder='Series title'
						value={formState.title}
						onChange={updateField("title")}
						disabled={isUpdatePending}
					/>
					<Textarea
						placeholder='Description (optional)'
						value={formState.description}
						onChange={updateField("description")}
						disabled={isUpdatePending}
					/>
					<SeriesGamesField
						openEnded={formState.openEnded}
						expectedGames={formState.expectedGames}
						disabled={isUpdatePending}
						hint={`${resolvedGames} already finished.`}
						onOpenEndedChange={(openEnded) =>
							onFormStateChange({
								...formState,
								openEnded,
								// Switching to a fixed count starts from what's
								// already been played.
								expectedGames: openEnded
									? formState.expectedGames
									: String(Math.max(resolvedGames + openGames, 1)),
							})
						}
						onExpectedGamesChange={(expectedGames) =>
							onFormStateChange({ ...formState, expectedGames })
						}
					/>
					<div className='grid grid-cols-2 gap-3'>
						<label className='space-y-1 text-sm'>
							<span className='text-muted-foreground'>
								Starting points
							</span>
							<Input
								type='number'
								min={100}
								step={100}
								value={formState.startingStack}
								onChange={updateField("startingStack")}
								disabled={isUpdatePending || pointsLocked}
							/>
						</label>
						<label className='space-y-1 text-sm'>
							<span className='text-muted-foreground'>
								Weekly top-up
							</span>
							<Input
								type='number'
								min={0}
								step={10}
								value={formState.weeklyTopup}
								onChange={updateField("weeklyTopup")}
								disabled={isUpdatePending || pointsLocked}
							/>
						</label>
					</div>
					{pointsLocked ? (
						<p className='text-xs text-muted-foreground'>
							Points settings are locked once anyone has made a
							pick.
						</p>
					) : null}
					<label className='block space-y-1 text-sm'>
						<span className='text-muted-foreground'>
							Picks to rank
						</span>
						<Input
							type='number'
							min={0}
							max={50}
							step={1}
							value={formState.minBetsToRank}
							onChange={updateField("minBetsToRank")}
							disabled={isUpdatePending || rankingLocked}
						/>
						<span className='block text-xs text-muted-foreground'>
							Players with fewer picks on finished questions don't
							appear in the standings or win the title. You can
							change this while the series runs.
						</span>
					</label>
					<div className='flex justify-end gap-2'>
						<Button
							variant='outline'
							onClick={onCancel}
							disabled={isUpdatePending}
						>
							Cancel
						</Button>
						<Button onClick={onSave} disabled={isUpdatePending}>
							Save
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
