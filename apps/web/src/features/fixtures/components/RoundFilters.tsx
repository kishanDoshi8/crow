import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export const chipClass = (pressed: boolean, tone: "solid" | "soft" = "solid") =>
	cn(
		"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
		pressed
			? tone === "solid"
				? "border-foreground bg-foreground text-background"
				: "border-transparent bg-primary/10 text-primary"
			: "bg-card hover:bg-muted",
	);

// The sticky filter row on a competition's page: open or close every
// match, extra toggles, then the competition's rounds (matchweeks, cup
// rounds or days).
export const RoundFilters = forwardRef<
	HTMLDivElement,
	{
		top: number;
		allOpen: boolean;
		onToggleAll: () => void;
		toggles?: ReactNode;
		rounds: string[];
		round: string | null;
		onRoundChange: (round: string) => void;
	}
>(function RoundFilters({ top, allOpen, onToggleAll, toggles, rounds, round, onRoundChange }, ref) {
	const Icon = allOpen ? ChevronsDownUpIcon : ChevronsUpDownIcon;
	return (
		<div
			ref={ref}
			style={{ top }}
			className='sticky z-[6] border-b bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85'
		>
			<div className='flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
				<button
					type='button'
					onClick={onToggleAll}
					aria-label={allOpen ? "Close all matches" : "Open all matches"}
					title={allOpen ? "Close all" : "Open all"}
					className='flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
				>
					<Icon className='size-4' />
				</button>
				{toggles}
				{rounds.length > 0 ? <span aria-hidden='true' className='mx-0.5 h-5 w-px shrink-0 bg-border' /> : null}
				{rounds.map((label) => (
					<button
						key={label}
						type='button'
						aria-pressed={round === label}
						onClick={() => onRoundChange(label)}
						className={chipClass(round === label)}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
});
