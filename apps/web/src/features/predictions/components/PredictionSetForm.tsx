import { CalendarClock, CirclePlus, CircleX, CopyIcon, Flame, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/shared/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";
import { TagInput } from "@/features/predictions/components/TagInput";
import { CopyPredictionSheet } from "@/features/predictions/components/CopyPredictionSheet";
import {
	PredictionTimingFields,
	usePredictionTiming,
} from "@/features/predictions/components/PredictionTiming";
import { SeriesSelector } from "@/features/series";
import type { PredictionDraft } from "@/shared/lib/api";

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 12;

type Option = { id: number; text: string };
type Question = {
	id: number;
	title: string;
	description: string;
	hasDetails: boolean;
	options: Option[];
};

export type PredictionSetValues = {
	seriesId: string;
	eventTitle: string;
	predictions: PredictionDraft[];
	deadline: Date;
	// Set when the set should go live later; null for live now.
	opensAt: Date | null;
	tags: string[];
};

type PredictionSetFormProps = {
	roomId: string;
	initialSeriesId?: string | null;
	initialGoLive?: "now" | "later";
	isSubmitting: boolean;
	onSubmit: (values: PredictionSetValues) => void;
	onCancel: () => void;
	// Back to writing one prediction.
	onCreateOne: () => void;
};

// Several predictions written together, e.g. every question for one match.
// They share the series, the event, tags and timing, go live together and
// members get one notification for the lot.
export function PredictionSetForm({
	roomId,
	initialSeriesId = null,
	initialGoLive = "now",
	isSubmitting,
	onSubmit,
	onCancel,
	onCreateOne,
}: Readonly<PredictionSetFormProps>) {
	const nextId = useRef(1);
	const newOption = (): Option => ({ id: nextId.current++, text: "" });
	const newQuestion = (): Question => ({
		id: nextId.current++,
		title: "",
		description: "",
		hasDetails: false,
		options: [newOption(), newOption()],
	});

	const [questions, setQuestions] = useState<Question[]>(() => [newQuestion(), newQuestion()]);
	const [eventTitle, setEventTitle] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [seriesId, setSeriesId] = useState<string | null>(initialSeriesId);
	const timing = usePredictionTiming(undefined, initialGoLive);
	// The question a past prediction is being copied into, while the list is open.
	const [copyInto, setCopyInto] = useState<number | null>(null);
	// Shown once a submit has been tried, so empty fields aren't red from the start.
	const [wasSubmitted, setWasSubmitted] = useState(false);

	const update = (id: number, change: (question: Question) => Question) =>
		setQuestions((prev) => prev.map((q) => (q.id === id ? change(q) : q)));

	const isIncomplete = questions.some(
		(q) => !q.title.trim() || q.options.some((o) => !o.text.trim()),
	);

	const handleSubmit = () => {
		setWasSubmitted(true);
		if (!seriesId || isIncomplete || !timing.isValid()) return;
		onSubmit({
			seriesId,
			eventTitle: eventTitle.trim(),
			predictions: questions.map((q) => ({
				title: q.title.trim(),
				options: q.options.map((o) => o.text.trim()),
				description: q.description.trim() || undefined,
			})),
			deadline: new Date(timing.deadline),
			opensAt: timing.opensAt,
			tags,
		});
	};

	const count = `${questions.length} ${questions.length === 1 ? "prediction" : "predictions"}`;

	return (
		<div className={`p-4`}>
			<FieldSet className={`w-full max-w-md mx-auto`}>
				<FieldGroup>
					<Field data-invalid={wasSubmitted && !seriesId}>
						<FieldLabel htmlFor='series'>Series</FieldLabel>
						<SeriesSelector
							roomId={roomId}
							mode='active'
							value={seriesId}
							onValueChange={setSeriesId}
							placeholder='Select a series'
							autoSelect
						/>
						{wasSubmitted && !seriesId ? (
							<p className={`text-sm text-destructive`}>
								Choose the series these predictions belong to.
							</p>
						) : null}
					</Field>
					<Field>
						<FieldLabel htmlFor='event'>
							Event <span className='font-normal text-muted-foreground'>(optional)</span>
						</FieldLabel>
						<Input
							id='event'
							placeholder='e.g. "Arsenal vs Chelsea"'
							value={eventTitle}
							maxLength={80}
							onChange={(e) => setEventTitle(e.target.value)}
						/>
						<p className='text-xs text-muted-foreground'>
							What these are about. It names the notification and keeps them together in Needs you.
						</p>
					</Field>

					{questions.map((question, index) => (
						<QuestionCard
							key={question.id}
							number={index + 1}
							question={question}
							showErrors={wasSubmitted}
							canRemove={questions.length > 1}
							onChange={(change) => update(question.id, change)}
							onRemove={() => setQuestions((prev) => prev.filter((q) => q.id !== question.id))}
							onCopyPast={() => setCopyInto(question.id)}
							newOption={newOption}
						/>
					))}
					<Button
						variant='outline'
						className='text-primary'
						onClick={() => setQuestions((prev) => [...prev, newQuestion()])}
						disabled={questions.length >= MAX_QUESTIONS}
					>
						<CirclePlus />
						Add another question
					</Button>

					<Field>
						<FieldLabel htmlFor='tags'>
							Tags <span className='font-normal text-muted-foreground'>(optional, on every one)</span>
						</FieldLabel>
						<TagInput roomId={roomId} value={tags} onChange={setTags} />
					</Field>
					<Field>
						<PredictionTimingFields timing={timing} showGoLive showGoLiveChoice />
					</Field>
				</FieldGroup>

				{wasSubmitted && isIncomplete ? (
					<p role='alert' className='-mb-2 text-sm text-destructive'>
						Fill in every question and option, or remove the ones you don't need.
					</p>
				) : null}
				<Button
					variant={"linear"}
					className={`w-full cursor-pointer`}
					onClick={handleSubmit}
					size='lg'
					disabled={isSubmitting}
				>
					{isSubmitting && <Spinner />}
					{timing.opensAt ? (
						<>
							Schedule {count} <CalendarClock />
						</>
					) : (
						<>
							Start {count} <Flame fill='black' />
						</>
					)}
				</Button>
				<p className='-mt-3 text-center text-xs text-muted-foreground'>
					Members get one notification for the set.
				</p>
				<Button
					variant={"outline"}
					className={`w-full -mt-2`}
					size={"lg"}
					onClick={onCancel}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
				<Button variant='ghost' className='-mt-3 w-full' onClick={onCreateOne} disabled={isSubmitting}>
					Just one prediction instead
				</Button>
			</FieldSet>

			<CopyPredictionSheet
				roomId={roomId}
				open={copyInto !== null}
				onOpenChange={(open) => !open && setCopyInto(null)}
				description='Fills this question with the same question, options and details.'
				onPick={(_, item) => {
					const labels = [...(item.options ?? [])]
						.sort((a, b) => a.display_order - b.display_order)
						.map((option) => option.label)
						.slice(0, MAX_OPTIONS);
					if (copyInto !== null && labels.length >= 2) {
						update(copyInto, (q) => ({
							...q,
							title: item.title,
							description: item.description ?? "",
							hasDetails: !!item.description,
							options: labels.map((text) => ({ ...newOption(), text })),
						}));
					}
					setCopyInto(null);
				}}
			/>
		</div>
	);
}

type QuestionCardProps = {
	number: number;
	question: Question;
	showErrors: boolean;
	canRemove: boolean;
	onChange: (change: (question: Question) => Question) => void;
	onRemove: () => void;
	// Opens the room's past predictions to fill this question from.
	onCopyPast: () => void;
	newOption: () => Option;
};

function QuestionCard({
	number,
	question,
	showErrors,
	canRemove,
	onChange,
	onRemove,
	onCopyPast,
	newOption,
}: Readonly<QuestionCardProps>) {
	const titleId = `question-${question.id}`;
	const isBlank = question.options.every((option) => !option.text.trim());

	const setOption = (id: number, text: string) =>
		onChange((q) => ({
			...q,
			options: q.options.map((o) => (o.id === id ? { ...o, text } : o)),
		}));

	return (
		<section
			aria-label={`Question ${number}`}
			className='flex flex-col gap-3 rounded-xl border bg-card p-3'
		>
			<div className='flex min-h-8 items-center justify-between'>
				<FieldLabel
					htmlFor={titleId}
					className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'
				>
					Question {number}
				</FieldLabel>
				<div className='flex items-center gap-1'>
					<Button
						variant='ghost'
						size='icon-sm'
						onClick={onCopyPast}
						aria-label={`Copy a past prediction into question ${number}`}
						title='Copy a past prediction'
						className='text-muted-foreground'
					>
						<CopyIcon />
					</Button>
					{canRemove ? (
						<Button
							variant='ghost'
							size='icon-sm'
							onClick={onRemove}
							aria-label={`Remove question ${number}`}
							className='text-muted-foreground'
						>
							<Trash2Icon />
						</Button>
					) : null}
				</div>
			</div>
			<Textarea
				id={titleId}
				placeholder={number === 1 ? 'e.g. "Who wins?"' : 'e.g. "Both teams to score?"'}
				value={question.title}
				onChange={(e) => onChange((q) => ({ ...q, title: e.target.value }))}
				aria-invalid={showErrors && !question.title.trim()}
				className='min-h-12 bg-background'
			/>
			{question.options.map((option, index) => (
				<div key={option.id} className='flex items-center gap-2'>
					<Input
						id={`question-${question.id}-option-${option.id}`}
						aria-label={`Question ${number}, option ${index + 1}`}
						aria-invalid={showErrors && !option.text.trim()}
						value={option.text}
						onChange={(e) => setOption(option.id, e.target.value)}
						placeholder={`Option ${index + 1}`}
						className='bg-background'
					/>
					<Button
						variant='outline'
						size='icon'
						disabled={question.options.length <= 2}
						aria-label={`Remove option ${index + 1}`}
						onClick={() =>
							onChange((q) => ({
								...q,
								options: q.options.filter((o) => o.id !== option.id),
							}))
						}
					>
						<CircleX />
					</Button>
				</div>
			))}
			<div className='flex flex-wrap items-center gap-1'>
				<Button
					variant='ghost'
					size='sm'
					className='text-primary'
					onClick={() => {
						const added = newOption();
						// Drawn now, then focused while still inside the tap, so phones
						// open the keyboard on it.
						flushSync(() => onChange((q) => ({ ...q, options: [...q.options, added] })));
						document.getElementById(`question-${question.id}-option-${added.id}`)?.focus();
					}}
					disabled={question.options.length >= MAX_OPTIONS}
				>
					<CirclePlus />
					Add option
				</Button>
				{isBlank ? (
					<Button
						variant='ghost'
						size='sm'
						onClick={() =>
							onChange((q) => ({
								...q,
								options: [
									{ ...q.options[0], text: "Yes" },
									{ ...q.options[1], text: "No" },
								],
							}))
						}
					>
						Use Yes / No
					</Button>
				) : null}
				{question.hasDetails ? null : (
					<Button
						variant='ghost'
						size='sm'
						className='ml-auto'
						onClick={() => onChange((q) => ({ ...q, hasDetails: true }))}
					>
						Add details
					</Button>
				)}
			</div>
			{question.hasDetails ? (
				<Textarea
					aria-label={`Question ${number} details`}
					placeholder='How the winner is decided, what counts, any context.'
					value={question.description}
					maxLength={500}
					onChange={(e) => onChange((q) => ({ ...q, description: e.target.value }))}
					className='bg-background'
				/>
			) : null}
		</section>
	);
}
