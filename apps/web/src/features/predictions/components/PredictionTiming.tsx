import { Calendar, CalendarClock, ChevronDownIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Calendar as UICalendar } from "@/shared/ui/calendar";
import { FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { describeDeadline } from "@/shared/lib/deadline";

const PRESET_HOURS: Record<string, number> = { "1h": 1, "6h": 6, "12h": 12 };
const TOGGLE_ITEM =
	"flex-1 data-[state=on]:border data-[state=on]:border-primary data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary";

// A scheduled prediction must stay open at least this long after going live.
const MIN_OPEN_MS = 5 * 60 * 1000;

type TimingInitial = {
	deadline?: Date;
	// Scheduled predictions: when it goes live.
	opensAt?: Date | null;
};

// When a prediction (or a set of them) goes live and when it locks. Shared
// by the one-prediction form and the set form.
export function usePredictionTiming(
	initial?: TimingInitial,
	initialGoLive: "now" | "later" = "now",
) {
	// "later" schedules it: hidden from members until opensAt.
	const [goLive, setGoLive] = useState<"now" | "later">(
		initial?.opensAt ? "later" : initialGoLive,
	);
	const [opensDate, setOpensDate] = useState<Date | undefined>(
		initial?.opensAt ?? nextWholeHour(Date.now() + 24 * 60 * 60 * 1000),
	);
	const [opensTime, setOpensTime] = useState<string>(
		format(initial?.opensAt ?? nextWholeHour(Date.now() + 24 * 60 * 60 * 1000), "HH:mm"),
	);
	const opensAt = goLive === "later" ? (combine(opensDate, opensTime) ?? null) : null;
	// Editing keeps the current deadline, so it starts on the custom picker.
	const [preset, setPreset] = useState(initial?.deadline ? "custom" : "1h");
	const [deadline, setDeadline] = useState(
		initial?.deadline ?? new Date(Date.now() + 1 * 60 * 60 * 1000),
	);
	const [customDate, setCustomDate] = useState<Date | undefined>(
		initial?.deadline ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
	);
	const [customTime, setCustomTime] = useState<string>(
		initial?.deadline ? format(initial.deadline, "HH:mm") : "22:00",
	);

	useEffect(() => {
		// Presets count from when it goes live.
		if (preset in PRESET_HOURS) {
			const from = opensAt?.getTime() ?? Date.now();
			setDeadline(new Date(from + PRESET_HOURS[preset] * 60 * 60 * 1000));
			return;
		}
		if (preset === "custom") {
			const date = combine(customDate, customTime);
			if (date) setDeadline(date);
		}
	}, [customDate, customTime, preset, opensAt?.getTime()]);

	// Checked on submit, against the clock at that moment.
	const isValid = () =>
		!(opensAt && opensAt.getTime() <= Date.now()) &&
		deadline.getTime() > Date.now() &&
		!(opensAt && deadline.getTime() < opensAt.getTime() + MIN_OPEN_MS);

	return {
		goLive,
		setGoLive,
		opensDate,
		setOpensDate,
		opensTime,
		setOpensTime,
		opensAt,
		preset,
		setPreset,
		deadline,
		customDate,
		setCustomDate,
		customTime,
		setCustomTime,
		isValid,
	};
}

export type PredictionTiming = ReturnType<typeof usePredictionTiming>;

type PredictionTimingFieldsProps = {
	timing: PredictionTiming;
	// The "Goes live" block: hidden when editing a live prediction.
	showGoLive: boolean;
	// Now / Later: only when creating (going live early is a menu action).
	showGoLiveChoice: boolean;
};

export function PredictionTimingFields({
	timing,
	showGoLive,
	showGoLiveChoice,
}: Readonly<PredictionTimingFieldsProps>) {
	const { goLive, opensAt, deadline } = timing;
	const deadlineInfo = describeDeadline(deadline);
	const opensInfo = opensAt ? describeDeadline(opensAt) : null;
	const tooShort = !!opensAt && deadline.getTime() < opensAt.getTime() + MIN_OPEN_MS;
	const isInvalid = deadlineInfo.isPast || opensInfo?.isPast || tooShort;

	return (
		<>
			{showGoLive ? (
				<>
					<FieldLabel htmlFor='go-live' className={`mt-4`}>
						Goes live
					</FieldLabel>
					{showGoLiveChoice ? (
						<ToggleGroup
							id='go-live'
							type='single'
							variant='outline'
							spacing={2}
							className={`flex`}
							value={goLive}
							onValueChange={(value) => {
								if (value === "now" || value === "later") timing.setGoLive(value);
							}}
						>
							<ToggleGroupItem value='now' aria-label='Now' className={TOGGLE_ITEM}>
								Now
							</ToggleGroupItem>
							<ToggleGroupItem value='later' aria-label='Later' className={TOGGLE_ITEM}>
								<CalendarClock />
								Later
							</ToggleGroupItem>
						</ToggleGroup>
					) : null}
					{goLive === "later" ? (
						<>
							<DateTimeFields
								date={timing.opensDate}
								time={timing.opensTime}
								onDateChange={timing.setOpensDate}
								onTimeChange={timing.setOpensTime}
								timeLabel='Go-live time'
								className={showGoLiveChoice ? "mt-2" : undefined}
							/>
							<p className='text-xs text-muted-foreground'>
								Only organizers see it until then. Everyone is notified when it goes live.
							</p>
						</>
					) : null}
				</>
			) : null}

			<FieldLabel htmlFor='deadline' className={`mt-4`}>
				{opensAt ? "Locks after going live" : "Bidding deadline"}
			</FieldLabel>
			<ToggleGroup
				id='deadline'
				type='single'
				variant='outline'
				spacing={2}
				className={`flex`}
				value={timing.preset}
				onValueChange={timing.setPreset}
			>
				<ToggleGroupItem value='1h' aria-label='1 hour' className={TOGGLE_ITEM}>
					1h
				</ToggleGroupItem>
				<ToggleGroupItem value='6h' aria-label='6 hours' className={TOGGLE_ITEM}>
					6h
				</ToggleGroupItem>
				<ToggleGroupItem value='12h' aria-label='12 hours' className={TOGGLE_ITEM}>
					12h
				</ToggleGroupItem>
				<ToggleGroupItem value='custom' aria-label='Custom' className={TOGGLE_ITEM}>
					<Calendar />
				</ToggleGroupItem>
			</ToggleGroup>

			{timing.preset === "custom" && (
				<DateTimeFields
					date={timing.customDate}
					time={timing.customTime}
					onDateChange={timing.setCustomDate}
					onTimeChange={timing.setCustomTime}
					timeLabel='Lock time'
					className='mt-4'
				/>
			)}

			<Alert variant={isInvalid ? "destructive" : "default"}>
				<Clock className={isInvalid ? undefined : `text-muted-foreground`} />
				<AlertDescription>
					{opensInfo?.isPast ? (
						<span>The go-live time has already passed. Pick a later one.</span>
					) : deadlineInfo.isPast ? (
						<span>That time has already passed. Pick a later one.</span>
					) : tooShort ? (
						<span>Lock it at least 5 minutes after it goes live.</span>
					) : opensInfo ? (
						<span>
							Goes live{" "}
							<span className='font-semibold text-foreground'>{opensInfo.when}</span>
							{opensInfo.date ? ` · ${opensInfo.date}` : ""}
							{" · locks "}
							<span className='font-semibold text-foreground'>{deadlineInfo.when}</span>
							{deadlineInfo.date && deadlineInfo.date !== opensInfo.date
								? ` · ${deadlineInfo.date}`
								: ""}
						</span>
					) : (
						<span>
							Locks{" "}
							<span className='font-semibold text-foreground'>{deadlineInfo.when}</span>
							{deadlineInfo.date ? ` · ${deadlineInfo.date}` : ""}
							{` · ${deadlineInfo.relative}`}
						</span>
					)}
				</AlertDescription>
			</Alert>
		</>
	);
}

// A date ("PPP") and a time ("HH:mm") as one Date, or undefined.
function combine(date: Date | undefined, time: string) {
	if (!date || !time) return undefined;
	const [hours, minutes] = time.split(":").map(Number);
	const combined = new Date(date);
	combined.setHours(hours, minutes, 0, 0);
	return combined;
}

// The next whole hour after `ms`, e.g. 9:20 → 10:00.
function nextWholeHour(ms: number) {
	const date = new Date(ms);
	date.setHours(date.getHours() + 1, 0, 0, 0);
	return date;
}

type DateTimeFieldsProps = {
	date: Date | undefined;
	time: string;
	onDateChange: (date: Date) => void;
	onTimeChange: (time: string) => void;
	timeLabel: string;
	className?: string;
};

// A day from the calendar and a time of day, side by side.
function DateTimeFields({
	date,
	time,
	onDateChange,
	onTimeChange,
	timeLabel,
	className,
}: Readonly<DateTimeFieldsProps>) {
	const [open, setOpen] = useState(false);
	return (
		<div className={`flex items-center gap-3 ${className ?? ""}`}>
			<div className={`min-w-0 flex-1`}>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button variant='outline' className='w-full justify-between'>
							<span className='truncate'>{date ? format(date, "EEE, MMM d") : "Select date"}</span>
							<ChevronDownIcon />
						</Button>
					</PopoverTrigger>
					<PopoverContent className='w-auto overflow-hidden p-0' align='start'>
						<UICalendar
							mode='single'
							selected={date}
							defaultMonth={date}
							captionLayout='dropdown'
							disabled={{ before: new Date() }}
							onSelect={(next) => {
								if (!next) return;
								onDateChange(next);
								setOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
			</div>
			<Input
				type='time'
				aria-label={timeLabel}
				value={time}
				onChange={(e) => {
					if (e.target.value) onTimeChange(e.target.value);
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
				className='w-34 shrink-0 bg-background'
			/>
		</div>
	);
}
