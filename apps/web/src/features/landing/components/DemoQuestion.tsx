import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import { track } from "@/shared/lib/analytics";

// A pretend question visitors can play in the hero: pick, lock in, see the
// result. Nothing is saved. The split and result are fixed so the numbers
// always add up.
const OPTIONS = [
	{ id: "home", label: "Arsenal", share: 46, color: "var(--option-1)" },
	{ id: "draw", label: "Draw", share: 22, color: "var(--option-2)" },
	{ id: "away", label: "Spurs", share: 32, color: "var(--option-3)" },
] as const;

const WINNER = "home";
const POINTS_ON_IT = 100;
// What 100 points on the winner collects from this split, net.
const POINTS_WON = 117;

type OptionId = (typeof OPTIONS)[number]["id"];
type Stage = "open" | "locked" | "revealed";

export function DemoQuestion({ className }: Readonly<{ className?: string }>) {
	const [pick, setPick] = useState<OptionId | null>(null);
	const [stage, setStage] = useState<Stage>("open");

	// Lock in, then the "host" reveals the result a beat later.
	useEffect(() => {
		if (stage !== "locked") return;
		const timer = window.setTimeout(() => setStage("revealed"), 1100);
		return () => window.clearTimeout(timer);
	}, [stage]);

	const choose = (id: OptionId) => {
		if (stage !== "open") return;
		track("landing_demo_pick");
		setPick(id);
		setStage("locked");
	};

	const reset = () => {
		setPick(null);
		setStage("open");
	};

	const revealed = stage === "revealed";
	const calledIt = revealed && pick === WINNER;
	const pickedLabel = OPTIONS.find((option) => option.id === pick)?.label;

	return (
		<div
			className={cn(
				"rounded-2xl border border-border bg-card p-5 text-card-foreground md:p-6",
				className,
			)}
		>
			<div className='flex items-center justify-between gap-3 text-xs text-muted-foreground'>
				<span>Example question</span>
				<span
					className={cn(
						"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
						revealed
							? "bg-win/10 text-win"
							: stage === "locked"
								? "bg-muted text-muted-foreground"
								: "bg-live/10 text-live",
					)}
				>
					<span
						aria-hidden='true'
						className={cn(
							"size-1.5 rounded-full bg-current",
							stage === "open" && "animate-pulse motion-reduce:animate-none",
						)}
					/>
					{revealed ? "Result's in" : stage === "locked" ? "Locked" : "Open"}
				</span>
			</div>

			<h2 className='mt-4 text-xl font-semibold leading-snug text-balance md:text-2xl'>
				Who wins the derby on Sunday?
			</h2>

			<ul className='mt-5 flex flex-col gap-2.5' aria-live='polite'>
				{OPTIONS.map((option) => {
					const isPick = pick === option.id;
					const isWinner = revealed && option.id === WINNER;
					return (
						<li key={option.id}>
							<button
								type='button'
								onClick={() => choose(option.id)}
								disabled={stage !== "open"}
								aria-pressed={isPick}
								className={cn(
									"relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors outline-none",
									"focus-visible:ring-[3px] focus-visible:ring-ring/50",
									stage === "open"
										? "cursor-pointer border-border hover:border-foreground/30 hover:bg-muted/40"
										: "cursor-default",
									isPick && stage !== "open" ? "border-foreground/40" : "border-border",
									isWinner && "border-win/60",
								)}
							>
								{/* The split fills in once picks lock, like in a real room. */}
								<span
									aria-hidden='true'
									className='absolute inset-y-0 left-0 opacity-20 transition-[width] duration-700 ease-out motion-reduce:transition-none'
									style={{
										width: stage === "open" ? "0%" : `${option.share}%`,
										background: option.color,
									}}
								/>
								<span className='relative flex items-center gap-2.5'>
									<span
										aria-hidden='true'
										className='size-2.5 rounded-full'
										style={{ background: option.color }}
									/>
									{option.label}
									{isPick ? (
										<span className='text-xs font-normal text-muted-foreground'>
											your pick
										</span>
									) : null}
								</span>
								<span
									className={cn(
										"relative flex items-center gap-1.5 tabular-nums",
										isWinner ? "font-semibold text-win" : "text-muted-foreground",
									)}
								>
									{isWinner ? <CheckIcon aria-label='Winner' className='size-4' /> : null}
									{stage === "open" ? "" : `${option.share}%`}
								</span>
							</button>
						</li>
					);
				})}
			</ul>

			<div className='mt-5 min-h-12 text-sm'>
				{stage === "open" ? (
					<p className='text-muted-foreground'>
						Tap an option to make your call. {POINTS_ON_IT} pts on it.
					</p>
				) : null}
				{stage === "locked" ? (
					<p className='text-muted-foreground'>
						Pick locked in. Waiting on the result…
					</p>
				) : null}
				{revealed ? (
					<div className='flex flex-wrap items-center justify-between gap-3'>
						<p>
							<span
								className={cn(
									"mr-2 font-semibold tabular-nums",
									calledIt ? "text-win" : "text-loss",
								)}
							>
								{calledIt ? `+${POINTS_WON}` : `−${POINTS_ON_IT}`}
							</span>
							{calledIt
								? "Called it. Crow about it."
								: `You picked ${pickedLabel}. Time to eat crow.`}
						</p>
						<Button variant='outline' size='sm' onClick={reset}>
							Play again
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}
