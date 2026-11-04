import { useRoomContext } from "@/shared/lib/roomContext";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useRoomRole } from "@/features/rooms";
import { useCreateSeries } from "@/features/series/hooks/series";
import { useMarkSuggestionPlayed } from "@/features/series/hooks/suggestions";
import { useLocation } from "react-router-dom";
import {
	parseExpectedGames,
	SeriesGamesField,
} from "@/features/series/components/SeriesGamesField";
import { Button, Input } from "@/shared/ui";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
	getMinBetsError,
	getSeriesPointsError,
} from "@/features/series/lib/points";

type FormState = {
	title: string;
	description: string;
	openEnded: boolean;
	expectedGames: string;
	startingStack: string;
	weeklyTopup: string;
	minBetsToRank: string;
};

const DEFAULT_FORM: FormState = {
	title: "",
	description: "",
	openEnded: false,
	expectedGames: "3",
	startingStack: "1000",
	weeklyTopup: "100",
	minBetsToRank: "3",
};

const DESCRIPTION_MAX_LENGTH = 240;

export default function SeriesCreatePage() {
	const { room } = useRoomContext();
	const { back } = useAppNavigation();
	const { mutate: createSeries, isPending } = useCreateSeries(room.id);

	// Opened from an "Up next" idea: start from its title, and take it off
	// the board once the series exists.
	const fromIdea = (useLocation().state ?? null) as {
		suggestionId?: string;
		title?: string;
	} | null;
	const { mutate: markPlayed } = useMarkSuggestionPlayed(room.id);
	const [form, setForm] = useState<FormState>({
		...DEFAULT_FORM,
		title: fromIdea?.title ?? "",
	});

	const isOrganizer = useRoomRole(room).can.organize;

	const descriptionCount = form.description.length;
	const titleError = useMemo(() => {
		if (form.title.trim().length > 0) {
			return "";
		}
		return "Title is required.";
	}, [form.title]);

	const expectedGames = parseExpectedGames(
		form.openEnded,
		form.expectedGames,
	);
	const expectedGamesError =
		expectedGames === null
			? "Expected games must be a whole number of at least 1."
			: "";

	const pointsError = getSeriesPointsError(
		form.startingStack,
		form.weeklyTopup,
	);
	const minBetsError = getMinBetsError(form.minBetsToRank);

	const canSubmit =
		!isPending &&
		titleError.length === 0 &&
		expectedGamesError.length === 0 &&
		pointsError.length === 0 &&
		minBetsError.length === 0 &&
		isOrganizer;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!isOrganizer) {
			toast("Only room organizers can create a series.");
			return;
		}

		if (titleError.length > 0) {
			toast(titleError);
			return;
		}

		if (expectedGamesError.length > 0) {
			toast(expectedGamesError);
			return;
		}

		if (pointsError.length > 0) {
			toast(pointsError);
			return;
		}

		if (minBetsError.length > 0) {
			toast(minBetsError);
			return;
		}

		createSeries(
			{
				title: form.title.trim(),
				description: form.description.trim(),
				expectedGames: expectedGames ?? 0,
				startingStack: Number(form.startingStack),
				weeklyTopup: Number(form.weeklyTopup),
				minBetsToRank: Number(form.minBetsToRank),
			},
			{
				onSuccess: (series) => {
					if (fromIdea?.suggestionId) {
						markPlayed({
							suggestionId: fromIdea.suggestionId,
							seriesId: series.id,
						});
					}
					toast("Series created.");
					back(`/rooms/${room.code}/series`);
				},
				onError: (error) => {
					toast("Failed to create series.", {
						description: error.message,
					});
				},
			},
		);
	};

	return (
		<div className='mx-auto w-full max-w-md space-y-5 p-4'>
			<div>
				<h2 className='text-lg font-semibold'>New series</h2>
				<p className='mt-1 text-sm text-muted-foreground'>
					Everyone starts the series with the same points. Top
					balance when it closes wins the title.
				</p>
			</div>

			<form
				className='space-y-4 rounded-2xl border p-4'
				onSubmit={handleSubmit}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor='series-title'>Title</FieldLabel>
						<Input
							id='series-title'
							placeholder='e.g. Premier League Matchweek 6'
							value={form.title}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									title: event.target.value,
								}))
							}
							disabled={isPending}
							required
						/>
						<FieldDescription>
							Use a short, clear name members can recognize
							quickly.
						</FieldDescription>
					</Field>

					<Field>
						<FieldLabel htmlFor='series-description'>
							Description
						</FieldLabel>
						<Textarea
							id='series-description'
							placeholder='What is this series about?'
							value={form.description}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									description: event.target.value.slice(
										0,
										DESCRIPTION_MAX_LENGTH,
									),
								}))
							}
							disabled={isPending}
						/>
						<FieldDescription>
							Optional. {descriptionCount}/
							{DESCRIPTION_MAX_LENGTH}
						</FieldDescription>
					</Field>

					<SeriesGamesField
						openEnded={form.openEnded}
						expectedGames={form.expectedGames}
						disabled={isPending}
						onOpenEndedChange={(openEnded) =>
							setForm((current) => ({ ...current, openEnded }))
						}
						onExpectedGamesChange={(expectedGames) =>
							setForm((current) => ({ ...current, expectedGames }))
						}
					/>

					<div className='grid grid-cols-2 gap-3'>
						<Field>
							<FieldLabel htmlFor='series-starting-stack'>
								Starting points
							</FieldLabel>
							<Input
								id='series-starting-stack'
								type='number'
								min={100}
								step={100}
								value={form.startingStack}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										startingStack: event.target.value,
									}))
								}
								disabled={isPending}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor='series-weekly-topup'>
								Weekly top-up
							</FieldLabel>
							<Input
								id='series-weekly-topup'
								type='number'
								min={0}
								step={10}
								value={form.weeklyTopup}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										weeklyTopup: event.target.value,
									}))
								}
								disabled={isPending}
							/>
						</Field>
					</div>
					<FieldDescription>
						Every member gets the starting points. The top-up is
						added each Monday for players who bet that week. Locked
						once anyone bets.
					</FieldDescription>
					<Field>
						<FieldLabel htmlFor='series-min-bets'>
							Minimum bets to be ranked
						</FieldLabel>
						<Input
							id='series-min-bets'
							type='number'
							min={0}
							max={50}
							step={1}
							value={form.minBetsToRank}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									minBetsToRank: event.target.value,
								}))
							}
							disabled={isPending}
						/>
						<FieldDescription>
							Players who bet on fewer settled predictions don't
							appear in the standings or win the title. You can
							change this while the series runs.
						</FieldDescription>
					</Field>
				</FieldGroup>

				<div className='flex justify-end gap-2'>
					<Button
						type='button'
						variant='outline'
						onClick={() => back(`/rooms/${room.code}/series`)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button type='submit' disabled={!canSubmit}>
						{isPending ? "Creating..." : "Create series"}
					</Button>
				</div>
			</form>

			{!isOrganizer ? (
				<p className='text-sm text-muted-foreground'>
					Only room organizers can create a series.
				</p>
			) : null}
		</div>
	);
}
