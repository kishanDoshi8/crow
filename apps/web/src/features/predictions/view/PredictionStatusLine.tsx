import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClockIcon, CheckIcon, LockIcon, MinusCircleIcon, XCircleIcon } from "lucide-react";
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
	// "box": its own bordered line (prediction screen). "inline": no frame,
	// for sitting inside a card.
	variant?: Variant;
};

type Variant = "box" | "inline";

// The one line that says where a prediction stands: scheduled (organizers
// only), open with its countdown, locked, its result, or no result /
// cancelled with the reason.
export function PredictionStatusLine({
	prediction,
	winnerLabel,
	resolvedByName,
	correctedByName,
	onDeadline,
	variant = "box",
}: Readonly<Props>) {
	const deadline = new Date(prediction.deadline);

	if (prediction.status === "scheduled") {
		const opens = prediction.opens_at ? describeDeadline(new Date(prediction.opens_at)) : null;
		return (
			<StatusShell variant={variant} icon={<CalendarClockIcon className='size-3.5 text-accent' aria-hidden />}>
				<span className='flex-1'>
					<span className='font-semibold'>Scheduled</span>
					{opens ? ` · goes live ${opens.when}` : ""}
				</span>
				{opens ? <span className='shrink-0 text-xs text-muted-foreground'>{opens.relative}</span> : null}
			</StatusShell>
		);
	}

	if (prediction.status === "draft") {
		return (
			<OpenStatus deadline={deadline} onDeadline={onDeadline} variant={variant} />
		);
	}

	if (prediction.status === "locked") {
		return (
			<StatusShell variant={variant} icon={<LockIcon className='size-3.5 text-accent' aria-hidden />}>
				<span className='flex-1'>Locked · awaiting result</span>
				<span className='shrink-0 text-xs text-muted-foreground' title='When betting closed'>
					{formatAgo(prediction.deadline)}
				</span>
			</StatusShell>
		);
	}

	const when = prediction.resolved_at ? formatWhen(prediction.resolved_at) : null;
	const corrected = correctedByName ? ` · corrected by ${correctedByName}` : "";

	if (prediction.status === "revealed") {
		return (
			<StatusShell variant={variant} icon={<CheckIcon className='size-3.5 text-win' strokeWidth={3} aria-hidden />}>
				<span className='flex-1'>
					<span className='font-semibold'>{winnerLabel ?? "Result"} won</span>
					{resolvedByName ? ` · revealed by ${resolvedByName}` : ""}
					{corrected}
				</span>
				{when ? <span className='text-xs text-muted-foreground'>{when}</span> : null}
			</StatusShell>
		);
	}

	const cancelled = prediction.status === "cancelled";
	const Icon = cancelled ? XCircleIcon : MinusCircleIcon;
	const by = resolvedByName
		? `${cancelled ? "Cancelled" : "Marked"} by ${resolvedByName}${when ? ` · ${when}` : ""}`
		: when;

	return (
		<StatusShell variant={variant} icon={<Icon className='mt-0.5 size-3.5 text-muted-foreground' aria-hidden />} alignTop>
			<span className='flex-1'>
				<span className='font-semibold'>{cancelled ? "Cancelled" : "No result"}</span>
				{prediction.no_result_reason ? ` · ${prediction.no_result_reason}` : ""}
				{corrected}
				{by ? <span className='block text-xs text-muted-foreground'>{by}</span> : null}
			</span>
		</StatusShell>
	);
}

function StatusShell({
	icon,
	alignTop = false,
	variant,
	children,
}: Readonly<{ icon: ReactNode; alignTop?: boolean; variant: Variant; children: ReactNode }>) {
	return (
		<div
			role='status'
			className={cn(
				"flex gap-2 text-[13px]",
				alignTop ? "items-start" : "items-center",
				variant === "box" && "rounded-lg border bg-card px-3 py-2.5",
			)}
		>
			{icon}
			{children}
		</div>
	);
}

function OpenStatus({
	deadline,
	onDeadline,
	variant,
}: Readonly<{ deadline: Date; onDeadline?: () => void; variant: Variant }>) {
	const now = useNow(deadline);
	const left = deadline.getTime() - now;
	const fired = useRef(false);

	useEffect(() => {
		if (left <= 0 && !fired.current) {
			fired.current = true;
			onDeadline?.();
		}
	}, [left, onDeadline]);

	return (
		<StatusShell variant={variant} icon={<span className='size-2 shrink-0 rounded-full bg-live' aria-hidden />}>
			<span className='flex-1'>
				{left > 0 ? `Open · closes ${describeDeadline(deadline).when}` : "Closing…"}
			</span>
			{left > 0 ? (
				<span className='font-semibold tabular-nums text-live' aria-label='Time left'>
					{formatLeft(left)}
				</span>
			) : null}
		</StatusShell>
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
