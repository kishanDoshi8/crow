import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClockIcon, CheckIcon, ClockIcon, LockIcon, MinusCircleIcon, XCircleIcon } from "lucide-react";
import type { Prediction } from "@/features/predictions/types/types";
import { describeDeadline } from "@/shared/lib/deadline";
import { formatAgo, formatWhen } from "@/features/predictions/lib/predictionView";
import { cn } from "@/shared/lib/utils";

type Props = {
	prediction: Prediction;
	winnerLabel: string | null;
	resolvedByName: string | null;
	correctedByName: string | null;
	// Called once when an open prediction's deadline passes.
	onDeadline?: () => void;
};

const PILL = "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold";

// The same states for the top of a card on Home: what it is on the left as
// a pill, the time that goes with it on the right. Nothing is joined with a
// dot, so nothing breaks oddly when the card is narrow.
export function PredictionStatusRow({
	prediction,
	winnerLabel,
	onDeadline,
}: Readonly<Pick<Props, "prediction" | "winnerLabel" | "onDeadline">>) {
	const { status } = prediction;
	const resolved = prediction.resolved_at ? formatWhen(prediction.resolved_at) : null;

	if (status === "draft") {
		return <OpenRow deadline={new Date(prediction.deadline)} onDeadline={onDeadline} />;
	}

	let pill: ReactNode;
	let aside: string | null = resolved;
	if (status === "scheduled") {
		pill = <span className={cn(PILL, "bg-accent/15 text-accent")}>Scheduled</span>;
		aside = prediction.opens_at ? `Live ${describeDeadline(new Date(prediction.opens_at)).relative}` : null;
	} else if (status === "locked") {
		pill = (
			<span className={cn(PILL, "bg-accent/15 text-accent")}>
				<LockIcon className='size-3' aria-hidden />
				Locked
			</span>
		);
		aside = `Closed ${formatAgo(prediction.deadline)}`;
	} else if (status === "revealed") {
		pill = (
			<span className={cn(PILL, "bg-win/15 text-win")}>
				<CheckIcon className='size-3 shrink-0' strokeWidth={3} aria-hidden />
				<span className='truncate'>{winnerLabel ?? "Result"} won</span>
			</span>
		);
	} else {
		pill = (
			<span className={cn(PILL, "bg-muted text-muted-foreground")}>
				{status === "cancelled" ? "Cancelled" : "No result"}
			</span>
		);
	}

	return (
		<div role='status' className='flex flex-col gap-1'>
			<div className='flex items-center justify-between gap-3'>
				{pill}
				{aside ? <span className='shrink-0 text-xs text-muted-foreground'>{aside}</span> : null}
			</div>
			{prediction.no_result_reason && (status === "cancelled" || status === "no_result") ? (
				<p className='text-xs text-muted-foreground'>{prediction.no_result_reason}</p>
			) : null}
		</div>
	);
}

function OpenRow({ deadline, onDeadline }: Readonly<{ deadline: Date; onDeadline?: () => void }>) {
	const left = useTimeLeft(deadline, onDeadline);
	return (
		<div role='status' className='flex items-center justify-between gap-3'>
			<span className={cn(PILL, "bg-live/15 text-live")}>
				<span className='size-1.5 rounded-full bg-live' aria-hidden />
				{left > 0 ? "Open" : "Closing…"}
			</span>
			{left > 0 ? (
				<span className='shrink-0 text-sm font-semibold tabular-nums text-live'>
					{formatLeft(left)} left
				</span>
			) : null}
		</div>
	);
}

// Milliseconds until the deadline, ticking; calls onDeadline once it passes.
function useTimeLeft(deadline: Date, onDeadline?: () => void) {
	const now = useNow(deadline);
	const left = deadline.getTime() - now;
	const fired = useRef(false);

	useEffect(() => {
		if (left <= 0 && !fired.current) {
			fired.current = true;
			onDeadline?.();
		}
	}, [left, onDeadline]);

	return left;
}

// Where a prediction stands, as a strip tinted in the state's colour:
// scheduled (organizers only), open with its countdown, locked, its result,
// or no result / cancelled with the reason. What happened on the left, when
// on the right.
export function PredictionStatusLine({
	prediction,
	winnerLabel,
	resolvedByName,
	correctedByName,
	onDeadline,
}: Readonly<Props>) {
	const deadline = new Date(prediction.deadline);
	const when = prediction.resolved_at ? formatWhen(prediction.resolved_at) : null;
	const corrected = correctedByName ? `Corrected by ${correctedByName}` : null;

	if (prediction.status === "scheduled") {
		const opens = prediction.opens_at ? describeDeadline(new Date(prediction.opens_at)) : null;
		return (
			<StatusStrip
				tone='accent'
				icon={<CalendarClockIcon className='size-4' aria-hidden />}
				title='Scheduled'
				lines={opens ? [`Goes live ${opens.when}`] : []}
				aside={opens ? { main: opens.relative } : null}
			/>
		);
	}

	if (prediction.status === "draft") {
		return <OpenStatus deadline={deadline} onDeadline={onDeadline} />;
	}

	if (prediction.status === "locked") {
		return (
			<StatusStrip
				tone='accent'
				icon={<LockIcon className='size-3.5' aria-hidden />}
				title='Locked'
				lines={["Waiting on the result"]}
				aside={{ main: formatAgo(prediction.deadline), sub: "picks closed" }}
			/>
		);
	}

	if (prediction.status === "revealed") {
		return (
			<StatusStrip
				tone='win'
				icon={<CheckIcon className='size-4' strokeWidth={3} aria-hidden />}
				title={`${winnerLabel ?? "Result"} won`}
				lines={[resolvedByName ? `Revealed by ${resolvedByName}` : null, corrected]}
				aside={when ? { main: when } : null}
			/>
		);
	}

	const cancelled = prediction.status === "cancelled";
	const Icon = cancelled ? XCircleIcon : MinusCircleIcon;

	return (
		<StatusStrip
			tone='muted'
			icon={<Icon className='size-4' aria-hidden />}
			title={cancelled ? "Cancelled" : "No result"}
			reason={prediction.no_result_reason}
			lines={[
				resolvedByName ? `${cancelled ? "Cancelled" : "Marked"} by ${resolvedByName}` : null,
				corrected,
			]}
			aside={when ? { main: when } : null}
		/>
	);
}

type Tone = "live" | "accent" | "win" | "muted";

const TONES: Record<Tone, { strip: string; icon: string; title: string }> = {
	live: { strip: "bg-live/10", icon: "bg-live/15 text-live", title: "text-live" },
	accent: { strip: "bg-accent/10", icon: "bg-accent/15 text-accent", title: "text-accent" },
	win: { strip: "bg-win/10", icon: "bg-win/15 text-win", title: "text-win" },
	muted: { strip: "bg-secondary/70", icon: "bg-secondary text-muted-foreground", title: "" },
};

function StatusStrip({
	tone,
	icon,
	title,
	reason,
	lines,
	aside,
	asideTone,
}: Readonly<{
	tone: Tone;
	icon: ReactNode;
	title: string;
	// Why it was called off, in the reader's words, above the small print.
	reason?: string | null;
	lines: (string | null)[];
	aside: { main: string; sub?: string; label?: string } | null;
	asideTone?: string;
}>) {
	const toneClass = TONES[tone];
	const small = lines.filter(Boolean);

	return (
		<div role='status' className={cn("flex items-center gap-3 rounded-xl px-3.5 py-3", toneClass.strip)}>
			<span className={cn("flex size-8 shrink-0 items-center justify-center self-start rounded-full", toneClass.icon)}>
				{icon}
			</span>
			<span className='min-w-0 flex-1 leading-snug'>
				<span className={cn("block truncate text-sm font-semibold", toneClass.title)}>{title}</span>
				{reason ? <span className='mt-0.5 block text-[13px] text-foreground/85'>{reason}</span> : null}
				{small.map((line) => (
					<span key={line} className='block text-xs text-muted-foreground'>
						{line}
					</span>
				))}
			</span>
			{aside ? (
				<span className='shrink-0 self-start text-right leading-tight' aria-label={aside.label}>
					<span className={cn("block text-sm font-semibold tabular-nums", asideTone)}>{aside.main}</span>
					{aside.sub ? <span className='block text-[11px] text-muted-foreground'>{aside.sub}</span> : null}
				</span>
			) : null}
		</div>
	);
}

function OpenStatus({
	deadline,
	onDeadline,
}: Readonly<{ deadline: Date; onDeadline?: () => void }>) {
	const left = useTimeLeft(deadline, onDeadline);

	return (
		<StatusStrip
			tone='live'
			icon={<ClockIcon className='size-4' aria-hidden />}
			title={left > 0 ? "Open for picks" : "Closing…"}
			lines={left > 0 ? [`Closes ${describeDeadline(deadline).when}`] : []}
			aside={left > 0 ? { main: formatLeft(left), sub: "left", label: `${formatLeft(left)} left` } : null}
			asideTone='text-live text-base'
		/>
	);
}

// "2d 4h", "2h 14m", "14:05": precise only when it's close.
function formatLeft(ms: number) {
	const totalSeconds = Math.floor(ms / 1000);
	const days = Math.floor(totalSeconds / 86_400);
	const hours = Math.floor((totalSeconds % 86_400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The current time, ticking every second in the last hour and every 30
// seconds before that.
function useNow(deadline: Date) {
	const [now, setNow] = useState(() => Date.now());
	const closeToDeadline = deadline.getTime() - now < 3_600_000;

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), closeToDeadline ? 1000 : 30_000);
		return () => clearInterval(id);
	}, [closeToDeadline]);

	return now;
}
