import { useState } from "react";
import { toast } from "sonner";
import { useSetFixtureResult } from "@/features/admin/hooks";
import type { AdminResultFixture, ManualFixtureResult } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Spinner,
} from "@/shared/ui";

type Ending = "regular" | "extra_time" | "penalties" | "abandoned" | "postponed" | "cancelled";

const ENDINGS: { value: Ending; label: string }[] = [
	{ value: "regular", label: "90 minutes" },
	{ value: "extra_time", label: "Extra time" },
	{ value: "penalties", label: "Penalties" },
	{ value: "abandoned", label: "Abandoned" },
	{ value: "postponed", label: "Postponed" },
	{ value: "cancelled", label: "Called off" },
];

type Pair = { home: string; away: string };
const pair = (value?: { home: number | null; away: number | null }): Pair => ({
	home: value?.home?.toString() ?? "",
	away: value?.away?.toString() ?? "",
});
const toScore = (value: Pair) => ({ home: Number(value.home), away: Number(value.away) });
const filled = (value: Pair) => /^\d+$/.test(value.home) && /^\d+$/.test(value.away);

// An admin types a match's score when the feed is missing or wrong, or
// says it didn't finish. Nothing is revealed until the result is confirmed.
export function ScoreDialog({
	fixture,
	open,
	onOpenChange,
}: Readonly<{ fixture: AdminResultFixture; open: boolean; onOpenChange: (open: boolean) => void }>) {
	const result = fixture.result;
	const [ending, setEnding] = useState<Ending>(
		fixture.status === "finished" || !result ? (result?.duration ?? "regular") : (fixture.status as Ending),
	);
	const [ninety, setNinety] = useState(pair(result?.regular_time ?? result?.full_time));
	const [halfTime, setHalfTime] = useState(pair(result?.half_time));
	const [afterExtraTime, setAfterExtraTime] = useState(pair(result?.full_time));
	const [penalties, setPenalties] = useState(pair(result?.penalties));
	const { mutate: save, isPending } = useSetFixtureResult();

	const played = ending === "regular" || ending === "extra_time" || ending === "penalties";
	const ready =
		!played ||
		(filled(ninety) &&
			filled(halfTime) &&
			(ending === "regular" || filled(afterExtraTime)) &&
			(ending !== "penalties" || filled(penalties)));

	const submit = () => {
		const manual: ManualFixtureResult | null = played
			? {
					duration: ending,
					ninety: toScore(ninety),
					half_time: toScore(halfTime),
					...(ending === "regular" ? {} : { after_extra_time: toScore(afterExtraTime) }),
					...(ending === "penalties" ? { penalties: toScore(penalties) } : {}),
				}
			: null;
		save(
			{ fixtureId: fixture.id, status: played ? "finished" : ending, result: manual },
			{
				onSuccess: () => {
					onOpenChange(false);
					toast.success("Score saved", {
						description: "Check the answers, then confirm.",
						position: "top-center",
					});
				},
				onError: (error) =>
					toast.error("Couldn't save the score. Try again.", {
						description: error.message,
						position: "top-center",
					}),
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='mx-auto sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>
						{fixture.home} vs {fixture.away}
					</DialogTitle>
					<DialogDescription>
						The feed won't overwrite a score typed here.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					<fieldset className='space-y-2'>
						<legend className='text-xs font-medium text-muted-foreground'>How it ended</legend>
						<div className='flex flex-wrap gap-1.5'>
							{ENDINGS.map((option) => (
								<button
									key={option.value}
									type='button'
									aria-pressed={ending === option.value}
									onClick={() => setEnding(option.value)}
									className={cn(
										"rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
										ending === option.value
											? "border-primary bg-primary text-primary-foreground"
											: "bg-background hover:bg-muted",
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</fieldset>

					{played ? (
						<>
							<ScoreRow label='Half time' home={fixture.home} away={fixture.away} value={halfTime} onChange={setHalfTime} />
							<ScoreRow label='After 90 minutes' home={fixture.home} away={fixture.away} value={ninety} onChange={setNinety} />
							{ending !== "regular" ? (
								<ScoreRow
									label='After extra time'
									home={fixture.home}
									away={fixture.away}
									value={afterExtraTime}
									onChange={setAfterExtraTime}
								/>
							) : null}
							{ending === "penalties" ? (
								<ScoreRow label='Penalties' home={fixture.home} away={fixture.away} value={penalties} onChange={setPenalties} />
							) : null}
						</>
					) : (
						<p className='text-sm text-muted-foreground'>
							Then pick No result for each question, so everyone gets their points back.
						</p>
					)}
				</div>

				<DialogFooter className='gap-2'>
					<DialogClose asChild>
						<Button variant='outline'>Cancel</Button>
					</DialogClose>
					<Button variant='linear' disabled={!ready || isPending} onClick={submit}>
						{isPending ? <Spinner /> : null}
						Save score
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ScoreRow({
	label,
	home,
	away,
	value,
	onChange,
}: Readonly<{ label: string; home: string; away: string; value: Pair; onChange: (value: Pair) => void }>) {
	const id = label.toLowerCase().replaceAll(" ", "-");
	return (
		<fieldset className='space-y-1.5'>
			<legend className='text-xs font-medium text-muted-foreground'>{label}</legend>
			<div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2'>
				<label className='space-y-1'>
					<span className='block truncate text-xs'>{home}</span>
					<Input
						id={`${id}-home`}
						inputMode='numeric'
						pattern='[0-9]*'
						value={value.home}
						onChange={(event) => onChange({ ...value, home: event.target.value.trim() })}
					/>
				</label>
				<span className='pt-5 text-muted-foreground'>–</span>
				<label className='space-y-1'>
					<span className='block truncate text-xs'>{away}</span>
					<Input
						id={`${id}-away`}
						inputMode='numeric'
						pattern='[0-9]*'
						value={value.away}
						onChange={(event) => onChange({ ...value, away: event.target.value.trim() })}
					/>
				</label>
			</div>
		</fieldset>
	);
}
