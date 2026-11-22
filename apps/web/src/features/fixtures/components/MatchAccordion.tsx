import { AnimatePresence, m } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { kickoffTime } from "@/features/fixtures/lib/grouping";
import { collapseTransition, EASE_OUT } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";

export type MatchState = { tone: "none" | "some" | "all" | "picked"; label: string };

const TONES: Record<MatchState["tone"], string> = {
	none: "bg-secondary text-muted-foreground",
	some: "bg-accent/15 text-accent",
	all: "bg-win/15 text-win",
	picked: "bg-primary/10 text-primary",
};

// One match: teams on the left, kickoff and where it stands on the right,
// and its rows underneath, opening and closing in place.
export function MatchAccordion({
	home,
	away,
	kickoffAt,
	detail,
	state,
	open,
	onOpenChange,
	children,
}: Readonly<{
	home: string;
	away: string;
	kickoffAt: string;
	// A line under the teams: the match's name and where it's played.
	detail?: string | null;
	state: MatchState;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}>) {
	const panelId = useId();

	return (
		<div className='border-b last:border-b-0'>
			<button
				type='button'
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => onOpenChange(!open)}
				className='grid w-full grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50'
			>
				<span className='flex min-w-0 flex-col text-sm font-semibold leading-snug'>
					<span className='truncate'>{home}</span>
					<span className='truncate'>{away}</span>
					{detail ? (
						<span className='truncate text-xs font-normal text-muted-foreground'>{detail}</span>
					) : null}
				</span>
				<span className='flex flex-col items-end gap-1'>
					<time dateTime={kickoffAt} className='text-sm font-semibold tabular-nums'>
						{kickoffTime(kickoffAt)}
					</time>
					<m.span
						key={state.label}
						initial={{ opacity: 0.4, scale: 0.92 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.18, ease: EASE_OUT }}
						className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", TONES[state.tone])}
					>
						{state.label}
					</m.span>
				</span>
				<m.span
					aria-hidden='true'
					animate={{ rotate: open ? 180 : 0 }}
					transition={collapseTransition}
					className='text-muted-foreground'
				>
					<ChevronDownIcon className='size-4' />
				</m.span>
			</button>
			<AnimatePresence initial={false}>
				{open ? (
					<m.div
						id={panelId}
						key='panel'
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ height: { duration: 0.3, ease: EASE_OUT }, opacity: { duration: 0.2 } }}
						className='overflow-hidden'
					>
						<div className='px-4 pb-3'>{children}</div>
					</m.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
