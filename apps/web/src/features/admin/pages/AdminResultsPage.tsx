import { CheckCircle2Icon, PencilIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ScoreDialog } from "@/features/admin/components/ScoreDialog";
import { useAdminResults, useConfirmFixture } from "@/features/admin/hooks";
import { isReady } from "@/features/admin/lib/results";
import type {
	AdminResultFixture,
	CricketFixtureResult,
	FixtureResult,
	FixtureStatus,
} from "@/shared/lib/api";
import { describeDeadline } from "@/shared/lib/deadline";
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
	Skeleton,
	Spinner,
} from "@/shared/ui";

const NO_RESULT = "no_result";

const STATUS: Record<FixtureStatus, string> = {
	scheduled: "No final score yet",
	live: "Still playing",
	finished: "Full time",
	postponed: "Postponed",
	abandoned: "Abandoned",
	cancelled: "Called off",
};

// Played matches that rooms have questions on: confirm each one's answers
// and Crow reveals them in every room. Confirmed ones stay below for two
// weeks, to fix if the result was wrong.
export default function AdminResultsPage() {
	const { data, isPending, isError, refetch } = useAdminResults();

	if (isPending) {
		return (
			<div className='space-y-3'>
				<Skeleton className='h-40 w-full rounded-2xl' />
				<Skeleton className='h-40 w-full rounded-2xl' />
			</div>
		);
	}

	if (isError) {
		return (
			<p className='text-sm text-muted-foreground'>
				Couldn't load the results.{" "}
				<button
					type='button'
					className='font-medium text-foreground underline underline-offset-2'
					onClick={() => void refetch()}
				>
					Try again
				</button>
			</p>
		);
	}

	const ready = data.to_confirm.filter(isReady);
	const waiting = data.to_confirm.filter((fixture) => !isReady(fixture));

	return (
		<div className='space-y-10'>
			<dl className='grid grid-cols-3 divide-x rounded-2xl border bg-card'>
				<StatusCell
					label='To confirm'
					value={ready.length}
					hot={ready.length > 0}
				/>
				<StatusCell label='No score yet' value={waiting.length} />
				<StatusCell
					label='Last sync'
					value={
						data.last_synced_at
							? describeDeadline(new Date(data.last_synced_at))
									.relative
							: "Never"
					}
					small
				/>
			</dl>

			<section className='space-y-4'>
				<SectionHeading count={ready.length}>To confirm</SectionHeading>
				{ready.length === 0 ? (
					<p className='flex items-center gap-2 rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
						<CheckCircle2Icon
							className='size-4 text-win'
							aria-hidden='true'
						/>
						All caught up. No played match is waiting on you.
					</p>
				) : (
					ready.map((fixture) => (
						<ResultCard key={cardKey(fixture)} fixture={fixture} />
					))
				)}
			</section>

			{waiting.length > 0 ? (
				<section className='space-y-4'>
					<SectionHeading
						count={waiting.length}
						note="The feed is checked every 15 minutes. Type the score if it doesn't arrive."
					>
						Waiting for the score
					</SectionHeading>
					{waiting.map((fixture) => (
						<ResultCard key={cardKey(fixture)} fixture={fixture} />
					))}
				</section>
			) : null}

			{data.confirmed.length > 0 ? (
				<section className='space-y-4'>
					<SectionHeading count={data.confirmed.length}>
						Confirmed in the last two weeks
					</SectionHeading>
					{data.confirmed.map((fixture) => (
						<ResultCard key={cardKey(fixture)} fixture={fixture} />
					))}
				</section>
			) : null}
		</div>
	);
}

// A new score or confirmation starts the card over, with fresh suggestions.
const cardKey = (fixture: AdminResultFixture) =>
	`${fixture.id}:${JSON.stringify(fixture.result)}:${fixture.confirmed_at ?? ""}`;

function SectionHeading({
	children,
	count,
	note,
}: Readonly<{ children: ReactNode; count?: number; note?: string }>) {
	return (
		<div className='space-y-0.5 px-1'>
			<h2 className='flex items-baseline gap-2 text-base font-semibold'>
				{children}
				{count ? (
					<span className='text-sm font-medium text-muted-foreground tabular-nums'>
						{count}
					</span>
				) : null}
			</h2>
			{note ? (
				<p className='text-xs text-muted-foreground'>{note}</p>
			) : null}
		</div>
	);
}

function StatusCell({
	label,
	value,
	hot = false,
	small = false,
}: Readonly<{
	label: string;
	value: number | string;
	hot?: boolean;
	small?: boolean;
}>) {
	return (
		<div className='flex min-w-0 flex-col-reverse justify-between gap-0.5 px-3 py-2.5'>
			<dt className='text-xs text-muted-foreground'>{label}</dt>
			<dd
				className={cn(
					"font-bold tabular-nums",
					small ? "text-sm leading-tight mt-1.5" : "text-xl",
					hot && "text-primary",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

const score = (
	value: { home: number | null; away: number | null } | undefined,
) =>
	value && value.home !== null && value.away !== null
		? `${value.home} – ${value.away}`
		: null;

// The score as lines: the main one, then half time, extra time and the
// shootout where there were any.
function scoreLines(result: FixtureResult) {
	const ninety = score(result.regular_time) ?? score(result.full_time);
	const lines = [
		score(result.half_time) ? `Half time ${score(result.half_time)}` : null,
	];
	if (result.duration !== "regular")
		lines.push(`After extra time ${score(result.full_time) ?? "?"}`);
	if (result.duration === "penalties" && score(result.penalties)) {
		lines.push(`Penalties ${score(result.penalties)}`);
	}
	return { main: ninety ?? "?", lines: lines.filter(Boolean) as string[] };
}

// A cricket result as lines: how it ended, then each innings and the toss.
function cricketLines(fixture: AdminResultFixture, result: CricketFixtureResult) {
	const name = (side: "home" | "away" | null) =>
		side === "home" ? fixture.home : side === "away" ? fixture.away : "?";
	const lines = result.innings.map(
		(inning) => `${name(inning.team)} ${inning.runs}/${inning.wickets} (${inning.overs} ov)`,
	);
	if (result.toss_winner) {
		lines.push(
			`Toss: ${name(result.toss_winner)}${result.toss_choice ? `, chose to ${result.toss_choice}` : ""}`,
		);
	}
	return { main: result.status_text || "Finished", lines };
}

function ResultCard({ fixture }: Readonly<{ fixture: AdminResultFixture }>) {
	const confirmed = !!fixture.confirmed_at;
	const [editing, setEditing] = useState(!confirmed);
	const [answers, setAnswers] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			fixture.questions
				.map((q) => [q.id, q.outcome ?? q.suggested] as const)
				.filter(
					(entry): entry is readonly [string, string] => !!entry[1],
				),
		),
	);
	const [isScoreOpen, setIsScoreOpen] = useState(false);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const { mutate: confirm, isPending } = useConfirmFixture();

	const missing = fixture.questions.filter((q) => !answers[q.id]).length;
	const changed = fixture.questions.some(
		(q) => (answers[q.id] ?? null) !== q.outcome,
	);
	const calledOff = ["postponed", "abandoned", "cancelled"].includes(
		fixture.status,
	);
	const cricket = fixture.sport === "cricket";
	const result = !fixture.result
		? null
		: cricket
			? cricketLines(fixture, fixture.result as CricketFixtureResult)
			: scoreLines(fixture.result as FixtureResult);
	const answerLabel = (
		key: string | undefined,
		options: { key: string; label: string }[],
	) =>
		key === NO_RESULT
			? "No result"
			: (options.find((o) => o.key === key)?.label ?? "—");

	const submit = () =>
		confirm(
			{ fixtureId: fixture.id, outcomes: answers },
			{
				onSuccess: ({ revealed, fixed, not_fixed }) => {
					setIsConfirmOpen(false);
					setEditing(false);
					const details = [
						revealed > 0
							? `${revealed} ${revealed === 1 ? "question" : "questions"} revealed.`
							: null,
						fixed > 0
							? `Fixed in ${fixed} ${fixed === 1 ? "room" : "rooms"}.`
							: null,
						not_fixed > 0
							? `${not_fixed} couldn't change: their series has finished.`
							: null,
					].filter(Boolean);
					toast.success(
						confirmed ? "Result fixed" : "Result confirmed",
						{
							description: details.join(" ") || undefined,
							position: "top-center",
						},
					);
				},
				onError: (error) =>
					toast.error("Couldn't confirm the result. Try again.", {
						description: error.message,
						position: "top-center",
					}),
			},
		);

	return (
		<article className='rounded-2xl border bg-card'>
			<header className='flex items-start justify-between gap-3 px-3 pt-3'>
				<div className='min-w-0'>
					<h3 className='text-sm font-semibold'>
						{fixture.home} vs {fixture.away}
					</h3>
					<p className='text-xs text-muted-foreground'>
						{fixture.competition_name}
						{fixture.label ?? fixture.round_label
							? `, ${fixture.label ?? fixture.round_label}`
							: ""}
					</p>
				</div>
				<time
					dateTime={fixture.kickoff_at}
					className='shrink-0 text-xs text-muted-foreground'
				>
					{describeDeadline(new Date(fixture.kickoff_at)).when}
				</time>
			</header>

			<div className='flex items-end justify-between gap-3 px-3 py-3'>
				<div className='min-w-0'>
					<p className='text-xs text-muted-foreground'>
						{cricket && fixture.status === "finished" ? "Finished" : STATUS[fixture.status]}
					</p>
					{result ? (
						<>
							<p className={cn("font-bold tabular-nums", cricket ? "text-base" : "text-2xl")}>
								{result.main}
							</p>
							{result.lines.map((line) => (
								<p
									key={line}
									className='text-xs text-muted-foreground tabular-nums'
								>
									{line}
								</p>
							))}
							<p className='text-xs text-muted-foreground'>
								{fixture.result_source === "manual"
									? "Set by an admin"
									: "From the feed"}
							</p>
						</>
					) : (
						<p className='text-sm text-muted-foreground'>
							{cricket && fixture.status === "finished"
								? "No result from the feed: pick each answer"
								: "No score yet"}
						</p>
					)}
				</div>
				{editing ? (
					<Button
						variant='outline'
						size='sm'
						onClick={() => setIsScoreOpen(true)}
					>
						<PencilIcon />
						{cricket ? "Set status" : fixture.result ? "Edit score" : "Type score"}
					</Button>
				) : null}
			</div>

			<ul className='divide-y border-t'>
				{fixture.questions.map((question) => (
					<li key={question.id} className='space-y-2 px-3 py-3'>
						<div>
							<p className='text-sm font-medium'>
								{question.title}
							</p>
							<p className='text-xs text-muted-foreground'>
								In {question.rooms}{" "}
								{question.rooms === 1 ? "room" : "rooms"}
							</p>
							{question.by_hand > 0 ? (
								<p className='text-xs text-muted-foreground'>
									{question.by_hand} revealed by hand, so Crow
									leaves{" "}
									{question.by_hand === 1 ? "it" : "them"}
								</p>
							) : null}
						</div>
						{editing ? (
							<div
								className='flex flex-wrap gap-1.5'
								role='group'
								aria-label={`Answer for ${question.title}`}
							>
								{[
									...question.options,
									{ key: NO_RESULT, label: "No result" },
								].map((option) => {
									const selected =
										answers[question.id] === option.key;
									return (
										<button
											key={option.key}
											type='button'
											aria-pressed={selected}
											onClick={() =>
												setAnswers((current) => ({
													...current,
													[question.id]: option.key,
												}))
											}
											className={cn(
												"rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
												selected
													? "border-primary bg-primary text-primary-foreground"
													: "bg-background text-foreground hover:bg-muted",
											)}
										>
											{option.label}
											{question.suggested ===
											option.key ? (
												<span
													className={cn(
														"ml-1.5",
														selected
															? "opacity-80"
															: "text-muted-foreground",
													)}
												>
													suggested
												</span>
											) : null}
										</button>
									);
								})}
							</div>
						) : (
							<p className='text-sm'>
								<span className='text-muted-foreground'>
									Answer{" "}
								</span>
								<span className='font-semibold'>
									{answerLabel(
										question.outcome ?? undefined,
										question.options,
									)}
								</span>
							</p>
						)}
					</li>
				))}
			</ul>

			<footer className='flex flex-wrap items-center justify-end gap-2 border-t px-3 py-3'>
				{confirmed ? (
					<p className='mr-auto text-xs text-muted-foreground'>
						Confirmed{" "}
						{
							describeDeadline(
								new Date(fixture.confirmed_at as string),
							).relative
						}
						{fixture.confirmed_by
							? ` by ${fixture.confirmed_by}`
							: ""}
					</p>
				) : null}
				{editing && calledOff ? (
					<Button
						variant='ghost'
						size='sm'
						onClick={() =>
							setAnswers(
								Object.fromEntries(
									fixture.questions.map((q) => [
										q.id,
										NO_RESULT,
									]),
								),
							)
						}
					>
						No result for all
					</Button>
				) : null}
				{confirmed && !editing ? (
					<Button
						variant='outline'
						size='sm'
						onClick={() => setEditing(true)}
					>
						Fix result
					</Button>
				) : (
					<>
						{confirmed ? (
							<Button
								variant='ghost'
								size='sm'
								onClick={() => setEditing(false)}
							>
								Cancel
							</Button>
						) : null}
						<Button
							variant='linear'
							size='sm'
							disabled={missing > 0 || (confirmed && !changed)}
							onClick={() => setIsConfirmOpen(true)}
						>
							{confirmed ? "Save fix" : "Confirm"}
						</Button>
					</>
				)}
			</footer>

			<ScoreDialog
				fixture={fixture}
				open={isScoreOpen}
				onOpenChange={setIsScoreOpen}
			/>

			<Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
				<DialogContent className='mx-auto sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>
							{confirmed ? "Fix" : "Confirm"} {fixture.home} vs{" "}
							{fixture.away}?
						</DialogTitle>
						<DialogDescription>
							{confirmed
								? "Rooms where Crow revealed these get the new result. Rooms that revealed or fixed them by hand keep theirs."
								: "Crow reveals these in every room that has them, with one notification per room. Rooms that already revealed by hand keep their result."}
						</DialogDescription>
					</DialogHeader>
					<ul className='max-h-64 divide-y overflow-y-auto rounded-xl border text-sm'>
						{fixture.questions.map((question) => (
							<li
								key={question.id}
								className='flex items-baseline gap-3 px-3 py-2'
							>
								<span className='min-w-0 flex-1'>
									{question.title}
								</span>
								<span className='shrink-0 font-semibold'>
									{answerLabel(
										answers[question.id],
										question.options,
									)}
								</span>
							</li>
						))}
					</ul>
					<DialogFooter className='gap-2'>
						<DialogClose asChild>
							<Button variant='outline'>Back</Button>
						</DialogClose>
						<Button
							variant='linear'
							disabled={isPending}
							onClick={submit}
						>
							{isPending ? <Spinner /> : null}
							{confirmed ? "Save fix" : "Confirm and reveal"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</article>
	);
}
