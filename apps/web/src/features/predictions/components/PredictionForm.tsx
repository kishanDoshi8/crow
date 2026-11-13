import { CalendarClock, CirclePlus, CircleX, Copy, Flame, Layers, LockIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { TagInput } from "@/features/predictions/components/TagInput";
import {
	PredictionTimingFields,
	usePredictionTiming,
} from "@/features/predictions/components/PredictionTiming";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Spinner } from "@/shared/ui/spinner";
import { SeriesSelector } from "@/features/series";

const MAX_OPTIONS = 12;
const DEFAULT_PLACEHOLDERS = ["Yes, it will happen", "No, it will not happen"];

export type PredictionFormValues = {
	title: string;
	options: string[];
	deadline: Date;
	// Set when it should go live later; null for live now.
	opensAt: Date | null;
	seriesId: string | null;
	description: string;
	tags: string[];
};

type PredictionFormProps = {
	mode: "create" | "edit";
	roomId: string;
	// Edit mode starts from the prediction as it is; create mode can start
	// from a copy of a past one (no deadline: that's picked fresh).
	initial?: {
		title: string;
		options: string[];
		deadline?: Date;
		description?: string | null;
		tags?: string[];
		// Scheduled predictions: when it goes live.
		opensAt?: Date | null;
	};
	// Create mode: the series to preselect, and whether to start on "Later".
	initialSeriesId?: string | null;
	initialGoLive?: "now" | "later";
	// Create mode: opens the list of past predictions to copy from.
	onCopyPast?: () => void;
	// Create mode: switches to writing several predictions at once.
	onCreateSet?: () => void;
	// The question, details and options can't change once anyone has bet.
	lockedByBets?: boolean;
	isSubmitting: boolean;
	onSubmit: (values: PredictionFormValues) => void;
	onCancel: () => void;
};

export function PredictionForm({
	mode,
	roomId,
	initial,
	initialSeriesId = null,
	initialGoLive = "now",
	onCopyPast,
	onCreateSet,
	lockedByBets = false,
	isSubmitting,
	onSubmit,
	onCancel,
}: Readonly<PredictionFormProps>) {
	const [options, setOptions] = useState(() =>
		(initial?.options ?? ["", ""]).map((text, i) => ({
			id: i + 1,
			text,
			placeholder: DEFAULT_PLACEHOLDERS[i] ?? `Option ${i + 1}`,
		})),
	);
	const [question, setQuestion] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
	// Editing a scheduled prediction keeps it scheduled (going live early is a
	// menu action), so the now / later choice only shows when creating.
	const timing = usePredictionTiming(initial, initialGoLive);
	const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(
		initialSeriesId,
	);

	const [errors, setErrors] = useState<string[]>([]);

	useEffect(() => {
		if (errors.includes("question") && question.trim()) {
			setErrors((prev) => prev.filter((err) => err !== "question"));
		} else if (errors.some((err) => err.startsWith("option-"))) {
			options.forEach((option) => {
				if (option.text.trim()) {
					setErrors((prev) =>
						prev.filter((err) => err !== `option-${option.id}`),
					);
				}
			});
		}
	}, [question, options]);

	const handleRemoveOption = (id: number) => {
		if (options.length > 2) {
			setOptions(options.filter((option) => option.id !== id));
		}
	};

	const handleAddOption = () => {
		if (options.length < MAX_OPTIONS) {
			const newOption = {
				id: Date.now(),
				text: "",
				placeholder: `Option ${options.length + 1}`,
			};
			// Drawn now, then focused while still inside the tap, so phones open
			// the keyboard on it.
			flushSync(() => setOptions([...options, newOption]));
			document.getElementById(`answer-${newOption.id}`)?.focus();
		}
	};

	const handleSubmit = () => {
		const newErrors: string[] = [];
		if (mode === "create" && !selectedSeriesId) {
			newErrors.push("series");
		}
		if (!question.trim()) {
			newErrors.push("question");
		}
		if (!timing.isValid()) {
			newErrors.push("timing");
		}
		options.forEach((option) => {
			if (!option.text.trim()) {
				newErrors.push(`option-${option.id}`);
			}
		});
		setErrors(newErrors);

		if (newErrors.length === 0) {
			onSubmit({
				title: question,
				options: options.map((opt) => opt.text),
				deadline: new Date(timing.deadline),
				opensAt: timing.opensAt,
				seriesId: selectedSeriesId,
				description: description.trim(),
				tags,
			});
		}
	};

	const showGoLive = mode === "create" || !!initial?.opensAt;

	return (
		<div className={`p-4`}>
			<FieldSet className={`w-full max-w-md mx-auto`}>
				{mode === "create" && onCopyPast ? (
					<div className='flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5'>
						<Copy className='size-4 shrink-0 text-muted-foreground' />
						<p className='min-w-0 flex-1 text-sm text-muted-foreground'>
							{initial ? "Copied from a past prediction. Pick a new deadline." : "Same kind of question as before?"}
						</p>
						<Button variant='outline' size='sm' onClick={onCopyPast} className='shrink-0'>
							{initial ? "Copy another" : "Copy a past one"}
						</Button>
					</div>
				) : null}
				{mode === "create" && onCreateSet ? (
					<div className='-mt-3 flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5'>
						<Layers className='size-4 shrink-0 text-muted-foreground' />
						<p className='min-w-0 flex-1 text-sm text-muted-foreground'>
							Several questions about one match or event?
						</p>
						<Button variant='outline' size='sm' onClick={onCreateSet} className='shrink-0'>
							Add a set
						</Button>
					</div>
				) : null}
				<FieldGroup>
					{mode === "create" ? (
						<Field data-invalid={errors.includes("series")}>
							<FieldLabel htmlFor='series'>Series</FieldLabel>
							<SeriesSelector
								roomId={roomId}
								mode='active'
								value={selectedSeriesId}
								onValueChange={setSelectedSeriesId}
								placeholder='Select a series'
								autoSelect
							/>
							{errors.includes("series") ? (
								<p className={`text-sm text-destructive`}>
									Choose the series this prediction belongs to.
								</p>
							) : null}
						</Field>
					) : null}
					<Field>
						<FieldLabel htmlFor='question'>The Question</FieldLabel>
						<Textarea
							id='question'
							placeholder='e.g. "Will Bitcoin reach $100k by Sunday Night?"'
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							aria-invalid={errors.includes("question")}
							disabled={lockedByBets}
						/>
						{lockedByBets ? (
							<p className='flex items-center gap-2 text-xs text-muted-foreground'>
								<LockIcon className='size-3.5' />
								The question and details can't change once someone has bet.
							</p>
						) : null}
					</Field>
					<Field>
						<FieldLabel htmlFor='tags'>
							Tags <span className='font-normal text-muted-foreground'>(optional)</span>
						</FieldLabel>
						<TagInput roomId={roomId} value={tags} onChange={setTags} />
					</Field>
					<Field>
						<FieldLabel htmlFor='description'>
							Details <span className='font-normal text-muted-foreground'>(optional)</span>
						</FieldLabel>
						<Textarea
							id='description'
							placeholder='How the winner is decided, what counts, any context.'
							value={description}
							maxLength={500}
							onChange={(e) => setDescription(e.target.value)}
							disabled={lockedByBets}
						/>
						{description.length > 400 ? (
							<p className='text-right text-xs text-muted-foreground tabular-nums'>
								{description.length}/500
							</p>
						) : null}
					</Field>
					<Field>
						<FieldLabel htmlFor='answer' className={`flex`}>
							<span className={`flex-1`}>Outcome Options</span>
							<span className={`text-muted-foreground`}>
								{lockedByBets ? "Locked" : "Min 2 Required"}
							</span>
						</FieldLabel>
						{lockedByBets ? (
							<p className='flex items-center gap-2 text-xs text-muted-foreground'>
								<LockIcon className='size-3.5' />
								Options can't change once someone has bet.
							</p>
						) : null}
						{options.map((option, i) => (
							<div
								key={option.id}
								className={`flex items-center gap-2`}
							>
								<Input
									id={`answer-${option.id}`}
									aria-invalid={errors.includes(
										`option-${option.id}`,
									)}
									value={option.text}
									disabled={lockedByBets}
									onChange={(e) => {
										const newOptions = options.map((opt) =>
											opt.id === option.id
												? {
														...opt,
														text: e.target.value,
													}
												: opt,
										);
										setOptions(newOptions);
									}}
									placeholder={
										option.placeholder
											? option.placeholder
											: `Option ${i + 1}`
									}
								/>
								{lockedByBets ? null : (
									<Button
										variant={"outline"}
										size={"icon"}
										disabled={i < 2}
										onClick={() =>
											handleRemoveOption(option.id)
										}
									>
										<CircleX />
									</Button>
								)}
							</div>
						))}
						{lockedByBets ? null : (
							<Button
								variant={"outline"}
								size={"sm"}
								className={`mt-2 text-primary`}
								onClick={handleAddOption}
								disabled={options.length >= MAX_OPTIONS}
							>
								<CirclePlus className={`mr-2`} />
								Add option
							</Button>
						)}

						<PredictionTimingFields
							timing={timing}
							showGoLive={showGoLive}
							showGoLiveChoice={mode === "create"}
						/>
					</Field>
				</FieldGroup>
				<Button
					variant={"linear"}
					className={`w-full cursor-pointer`}
					onClick={handleSubmit}
					size='lg'
					disabled={isSubmitting}
				>
					{isSubmitting && <Spinner />}
					{mode === "edit" ? (
						"Save changes"
					) : timing.opensAt ? (
						<>
							Schedule it <CalendarClock />
						</>
					) : (
						<>
							Start Draft <Flame fill='black' />
						</>
					)}
				</Button>
				<Button
					variant={"outline"}
					className={`w-full -mt-2`}
					size={"lg"}
					onClick={onCancel}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
			</FieldSet>
		</div>
	);
}
