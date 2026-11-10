import { cn } from "@/shared/lib/utils";

type RankChangeProps = {
	// Places moved since Monday: positive is up. Null when there's nothing to
	// compare (first week of a series, or not ranked).
	change: number | null | undefined;
	// Ranked now but not on Monday.
	isNew?: boolean;
	// A small chip for after a name; shows nothing when the rank didn't move.
	pill?: boolean;
	className?: string;
};

// ▲2 / ▼3 / – / NEW next to a rank. Arrows and words carry the meaning, so
// it reads the same without colour.
export function RankChange({ change, isNew = false, pill = false, className }: Readonly<RankChangeProps>) {
	if (isNew) {
		return (
			<span
				className={cn(
					pill
						? "shrink-0 rounded-full bg-activity/15 px-1.5 text-[11px] font-semibold leading-[18px] text-activity"
						: "rounded-sm bg-primary/15 px-1 text-[10px] font-semibold leading-4 text-primary",
					className,
				)}
			>
				{pill ? "New" : "NEW"}
				<span className='sr-only'> in the standings since Monday</span>
			</span>
		);
	}

	if (change === null || change === undefined) {
		return null;
	}

	if (change === 0) {
		if (pill) return null;
		return (
			<span className={cn("text-xs text-muted-foreground", className)}>
				<span aria-hidden='true'>–</span>
				<span className='sr-only'>No change since Monday</span>
			</span>
		);
	}

	const up = change > 0;
	const places = Math.abs(change);
	return (
		<span
			className={cn(
				"font-semibold tabular-nums",
				pill ? "shrink-0 rounded-full px-1.5 text-[11px] leading-[18px]" : "text-xs",
				up ? "text-win" : "text-loss",
				pill && (up ? "bg-win/15" : "bg-loss/15"),
				className,
			)}
		>
			<span aria-hidden='true'>
				{up ? "▲" : "▼"}
				{places}
			</span>
			<span className='sr-only'>
				{up ? "Up" : "Down"} {places} {places === 1 ? "place" : "places"} since
				Monday
			</span>
		</span>
	);
}
