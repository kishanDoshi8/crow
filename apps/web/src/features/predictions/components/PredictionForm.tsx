import {
	Calendar,
	ChevronDownIcon,
	CirclePlus,
	CircleX,
	Clock,
	Flame,
	LockIcon,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { TagInput } from "@/features/predictions/components/TagInput";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Calendar as UICalendar } from "@/shared/ui/calendar";
import { format } from "date-fns";
import { Spinner } from "@/shared/ui/spinner";
import { SeriesSelector } from "@/features/series";
import { describeDeadline } from "@/shared/lib/deadline";

const PRESET_HOURS: Record<string, number> = { "1h": 1, "6h": 6, "12h": 12 };
const MAX_OPTIONS = 6;
const DEFAULT_PLACEHOLDERS = ["Yes, it will happen", "No, it will not happen"];

export type PredictionFormValues = {
	title: string;
	options: string[];
	deadline: Date;
	seriesId: string | null;
	description: string;
	tags: string[];
};

type PredictionFormProps = {
	mode: "create" | "edit";
	roomId: string;
	// Edit mode starts from the prediction as it is.
	initial?: {
		title: string;
		options: string[];
		deadline: Date;
		description?: string | null;
		tags?: string[];
	};
	// Create mode: the series to preselect.
	initialSeriesId?: string | null;
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
	// Editing keeps the current deadline, so it starts on the custom picker.
	const [biddingDeadline, setBiddingDeadline] = useState(
		initial ? "custom" : "1h",
	);
	const [deadlineDate, setDeadlineDate] = useState(
		initial?.deadline ?? new Date(Date.now() + 1 * 60 * 60 * 1000),
	);
	const [customDate, setCustomDate] = useState<Date | undefined>(
		initial?.deadline ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
	);
	const [customTime, setCustomTime] = useState<string>(
		initial ? format(initial.deadline, "HH:mm") : "22:00",
	);
	const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(
		initialSeriesId,
	);
	const [openCustomDatePicker, setOpenCustomDatePicker] = useState(false);

	const [errors, setErrors] = useState<string[]>([]);

	useEffect(() => {
		calculateDeadline();
	}, [customDate, customTime, biddingDeadline]);

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
			setOptions([...options, newOption]);
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
		if (deadlineDate.getTime() <= Date.now()) {
			newErrors.push("deadline");
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
				deadline: new Date(deadlineDate),
				seriesId: selectedSeriesId,
				description: description.trim(),
				tags,
			});
		}
	};

	const calculateDeadline = () => {
		if (biddingDeadline in PRESET_HOURS) {
			const hours = PRESET_HOURS[biddingDeadline];
			setDeadlineDate(new Date(Date.now() + hours * 60 * 60 * 1000));
			return;
		}
		if (biddingDeadline === "custom" && customDate && customTime) {
			const [hours, minutes] = customTime.split(":").map(Number);
			const date = new Date(customDate);
			date.setHours(hours, minutes, 0, 0);
			setDeadlineDate(date);
		}
	};

	const deadlineInfo = describeDeadline(deadlineDate);

	return (
		<div className={`p-4`}>
			<FieldSet className={`w-full max-w-md mx-auto`}>
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
								Add Option
							</Button>
						)}

						<FieldLabel htmlFor='deadline' className={`mt-4`}>
							Bidding deadline
						</FieldLabel>
						<ToggleGroup
							id='deadline'
							type='single'
							variant='outline'
							spacing={2}
							className={`flex`}
							value={biddingDeadline}
							onValueChange={(value) => {
								setBiddingDeadline(value);
							}}
						>
							<ToggleGroupItem
								value='1h'
								aria-label='1 hour'
								className='flex-1 data-[state=on]:border data-[state=on]:border-primary data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary'
							>
								1h
							</ToggleGroupItem>
							<ToggleGroupItem
								value='6h'
								aria-label='6 hours'
								className='flex-1 data-[state=on]:border data-[state=on]:border-primary data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary'
							>
								6h
							</ToggleGroupItem>
							<ToggleGroupItem
								value='12h'
								aria-label='12 hours'
								className='flex-1 data-[state=on]:border data-[state=on]:border-primary data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary'
							>
								12h
							</ToggleGroupItem>
							<ToggleGroupItem
								value='custom'
								aria-label='Custom'
								className='flex-1 data-[state=on]:border data-[state=on]:border-primary data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary'
							>
								<Calendar />
							</ToggleGroupItem>
						</ToggleGroup>

						{biddingDeadline === "custom" && (
							<div className={`flex items-center gap-4 mt-4`}>
								<div className={`flex-1`}>
									<Popover
										open={openCustomDatePicker}
										onOpenChange={setOpenCustomDatePicker}
									>
										<PopoverTrigger asChild>
											<Button
												variant='outline'
												className='justify-between'
											>
												{customDate
													? format(customDate, "PPP")
													: "Select date"}
												<ChevronDownIcon />
											</Button>
										</PopoverTrigger>
										<PopoverContent
											className='w-auto overflow-hidden p-0'
											align='start'
										>
											<UICalendar
												mode='single'
												selected={customDate}
												defaultMonth={customDate}
												captionLayout='dropdown'
												disabled={{
													before: new Date(),
												}}
												onSelect={(date) => {
													if (!date) return;
													setCustomDate(date);
													setOpenCustomDatePicker(
														false,
													);
												}}
											/>
										</PopoverContent>
									</Popover>
								</div>
								<Input
									type='time'
									aria-label='Lock time'
									value={customTime}
									onChange={(e) => {
										if (e.target.value) setCustomTime(e.target.value);
									}}
									onClick={(e) => {
										// Opens the clock where the browser supports it;
										// elsewhere tapping the field opens the native picker.
										try {
											e.currentTarget.showPicker?.();
										} catch {
											// Not allowed in this context; typing still works.
										}
									}}
									className='w-36 shrink-0 bg-background'
								/>
							</div>
						)}

						<Alert
							variant={deadlineInfo.isPast ? "destructive" : "default"}
						>
							<Clock
								className={
									deadlineInfo.isPast ? undefined : `text-muted-foreground`
								}
							/>
							<AlertDescription>
								{deadlineInfo.isPast ? (
									<span>
										That time has already passed. Pick a later one.
									</span>
								) : (
									<span>
										Locks{" "}
										<span className='font-semibold text-foreground'>
											{deadlineInfo.when}
										</span>
										{deadlineInfo.date ? ` · ${deadlineInfo.date}` : ""}
										{` · ${deadlineInfo.relative}`}
									</span>
								)}
							</AlertDescription>
						</Alert>
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
					{mode === "create" ? (
						<>
							Start Draft <Flame fill='black' />
						</>
					) : (
						"Save changes"
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
