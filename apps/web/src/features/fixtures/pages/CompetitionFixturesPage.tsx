import { m } from "framer-motion";
import { CheckCircle2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { FollowButton, kindLabel } from "@/features/fixtures/components/CompetitionRow";
import { CompetitionMark } from "@/features/fixtures/components/CompetitionMark";
import { DayHeader } from "@/features/fixtures/components/DayHeader";
import { MatchAccordion, type MatchState } from "@/features/fixtures/components/MatchAccordion";
import { NoActiveSeries } from "@/features/fixtures/components/NoActiveSeries";
import { chipClass, RoundFilters } from "@/features/fixtures/components/RoundFilters";
import { useAddFixtureQuestions, useCompetitionFixtures } from "@/features/fixtures/hooks";
import { daysOf, matchDetail, roundsOf } from "@/features/fixtures/lib/grouping";
import { useStickyOffset } from "@/features/fixtures/lib/useStickyOffset";
import { useRoomRole } from "@/features/rooms";
import { SeriesSelector, useCurrentSeries } from "@/features/series";
import type { Fixture, FixtureQuestion } from "@/shared/lib/api";
import { EASE_OUT } from "@/shared/lib/motion";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Button, Checkbox, Skeleton, Spinner } from "@/shared/ui";

type Match = Omit<Fixture, "competition_id" | "competition_name">;

const addable = (match: Match) => match.questions.filter((q) => !q.prediction_id);

// One competition's coming matches, a round at a time, by day. Hosts tick
// questions across matches and add them in one go: picks close at
// kickoff, and players get one notification for the lot.
export default function CompetitionFixturesPage() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { competitionId = "" } = useParams<{ competitionId: string }>();
	const { data, isPending, isError, refetch } = useCompetitionFixtures(room.id, competitionId, can.organize);
	const { mutate: addQuestions, isPending: isAdding } = useAddFixtureQuestions(room.id);
	const { currentSeries, seriesOptions, hasActiveSeries } = useCurrentSeries(room.id);
	const [seriesId, setSeriesId] = useState<string | null>(
		currentSeries?.status === "active" ? currentSeries.id : null,
	);
	const [round, setRound] = useState<string | null>(null);
	const [hideAdded, setHideAdded] = useState(false);
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	// Matches the host opened or closed; the rest follow the default (open
	// while nothing from them is added).
	const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
	const { header, total, ref: filtersRef } = useStickyOffset();

	const rounds = useMemo(() => roundsOf(data?.fixtures ?? []), [data?.fixtures]);
	const activeRound = rounds.find((r) => r.label === round) ?? rounds[0] ?? null;
	const visible = useMemo(
		() =>
			(activeRound?.fixtures ?? [])
				.map((match) => (hideAdded ? { ...match, questions: addable(match) } : match))
				.filter((match) => match.questions.length > 0),
		[activeRound, hideAdded],
	);
	const days = useMemo(() => daysOf(visible), [visible]);
	const activeSeries = seriesOptions.filter((s) => s.status === "active");

	// A question that's no longer on offer (added meanwhile, kicked off)
	// drops out of the selection.
	const chosen = useMemo(() => {
		const available = new Set((data?.fixtures ?? []).flatMap((f) => addable(f).map((q) => q.id)));
		return [...selected].filter((id) => available.has(id));
	}, [data?.fixtures, selected]);

	useEffect(() => {
		if (!seriesId && currentSeries?.status === "active") setSeriesId(currentSeries.id);
	}, [currentSeries, seriesId]);

	if (!can.organize) return <Navigate to={`/rooms/${room.code}`} replace />;

	const isOpen = (match: Match) => openOverride[match.id] ?? addable(match).length === match.questions.length;
	const allOpen = visible.length > 0 && visible.every(isOpen);
	const setOpen = (ids: string[], open: boolean) =>
		setOpenOverride((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, open])) }));
	const toggle = (ids: string[], on: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			for (const id of ids) {
				if (on) next.add(id);
				else next.delete(id);
			}
			return next;
		});

	const stateOf = (match: Match): MatchState => {
		const count = match.questions.length;
		const fresh = addable(match);
		const picked = fresh.filter((q) => selected.has(q.id)).length;
		const added = count - fresh.length;
		if (picked > 0) return { tone: "picked", label: `${picked} selected` };
		if (added === count) return { tone: "all", label: "All added" };
		if (added > 0) return { tone: "some", label: `${added} of ${count} added` };
		return { tone: "none", label: `${count} to add` };
	};

	const submit = () => {
		if (!seriesId || chosen.length === 0) return;
		addQuestions(
			{ seriesId, questionIds: chosen },
			{
				onSuccess: ({ count }) => {
					setSelected(new Set());
					toast.success(`${count} ${count === 1 ? "question" : "questions"} live`, {
						description: "Picks close at kickoff. Players got one notification.",
						position: "top-center",
					});
				},
				onError: (error) => {
					toast.error("Couldn't add the questions. Try again.", {
						description: error.message,
						position: "top-center",
					});
					void refetch();
				},
			},
		);
	};

	if (isPending) {
		return (
			<div className='mx-auto w-full max-w-md space-y-3 p-4 lg:max-w-2xl'>
				<Skeleton className='h-14 w-2/3' />
				<Skeleton className='h-8 w-full rounded-full' />
				<Skeleton className='h-40 w-full rounded-2xl' />
			</div>
		);
	}

	if (isError || !data) {
		return (
			<div className='mx-auto w-full max-w-md space-y-3 p-4 text-sm text-muted-foreground lg:max-w-2xl'>
				<p>Couldn't load this competition. It may have been turned off.</p>
				<Button asChild variant='outline' size='sm'>
					<Link to={`/rooms/${room.code}/manage/fixtures`}>All competitions</Link>
				</Button>
			</div>
		);
	}

	const { competition } = data;

	return (
		<>
			<div className='mx-auto w-full max-w-md lg:max-w-2xl'>
				<header className='flex items-center gap-3 px-4 pt-4 pb-3'>
					<CompetitionMark name={competition.name} className='size-12 text-sm' />
					<div className='min-w-0 flex-1'>
						<h2 className='text-lg leading-tight font-bold text-balance'>{competition.name}</h2>
						<p className='text-xs text-muted-foreground'>
							{[kindLabel(competition.kind), competition.season].filter(Boolean).join(", ")}
						</p>
					</div>
					<FollowButton
						roomId={room.id}
						competitionId={competition.id}
						name={competition.name}
						following={competition.following}
					/>
				</header>

				<div className='space-y-3 px-4 pb-3'>
					<NoActiveSeries roomId={room.id} roomCode={room.code} />
					{activeSeries.length > 1 ? (
						<div className='flex items-center gap-2 text-xs text-muted-foreground'>
							<span className='shrink-0'>Adding to</span>
							<SeriesSelector
								roomId={room.id}
								mode='active'
								value={seriesId}
								onValueChange={setSeriesId}
								placeholder='Select a series'
								autoSelect
								className='h-8 flex-1'
							/>
						</div>
					) : activeSeries.length === 1 ? (
						<p className='text-xs text-muted-foreground'>
							Adding to <span className='font-semibold text-foreground'>{activeSeries[0].title}</span>
						</p>
					) : null}
				</div>

				<RoundFilters
					ref={filtersRef}
					top={header}
					allOpen={allOpen}
					onToggleAll={() => setOpen(visible.map((match) => match.id), !allOpen)}
					toggles={
						<button
							type='button'
							aria-pressed={hideAdded}
							onClick={() => setHideAdded((on) => !on)}
							className={chipClass(hideAdded, "soft")}
						>
							{hideAdded ? "Show added" : "Hide added"}
						</button>
					}
					rounds={rounds.map((r) => r.label)}
					round={activeRound?.label ?? null}
					onRoundChange={setRound}
				/>

				{rounds.length === 0 ? (
					<p className='m-4 rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
						No matches in the next six weeks.
					</p>
				) : days.length === 0 ? (
					<p className='m-4 flex items-center gap-2 rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
						<CheckCircle2Icon className='size-4 text-win' aria-hidden='true' />
						Everything in {activeRound?.label} is added.
					</p>
				) : (
					<div className='pb-6 lg:space-y-3 lg:px-4 lg:pt-3'>
						{days.map((day) => {
							const ids = day.fixtures.flatMap((match) => addable(match).map((q) => q.id));
							const allPicked = ids.length > 0 && ids.every((id) => selected.has(id));
							return (
								<section key={day.label} className='lg:overflow-clip lg:rounded-2xl lg:border'>
									<DayHeader
										label={day.label}
										top={total}
										action={
											ids.length > 0 ? (
												<button
													type='button'
													onClick={() => {
														toggle(ids, !allPicked);
														if (!allPicked) setOpen(day.fixtures.map((match) => match.id), true);
													}}
													className='text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
												>
													{allPicked ? "Clear day" : "Select day"}
												</button>
											) : null
										}
									/>
									{day.fixtures.map((match) => (
										<MatchAccordion
											key={match.id}
											home={match.home}
											away={match.away}
											kickoffAt={match.kickoff_at}
											detail={matchDetail(match)}
											state={stateOf(match)}
											open={isOpen(match)}
											onOpenChange={(open) => setOpen([match.id], open)}
										>
											<ul className='space-y-0.5'>
												{match.questions.map((question) => (
													<QuestionRow
														key={question.id}
														question={question}
														roomCode={room.code}
														checked={selected.has(question.id)}
														onToggle={(on) => toggle([question.id], on)}
													/>
												))}
											</ul>
											{addable(match).length > 1 ? (
												<MatchSelectAll
													ids={addable(match).map((q) => q.id)}
													selected={selected}
													onToggle={toggle}
												/>
											) : null}
										</MatchAccordion>
									))}
								</section>
							);
						})}
					</div>
				)}
			</div>

			{hasActiveSeries ? (
				<div className='sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
					<div className='mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:max-w-2xl'>
						<p className='min-w-0 flex-1 text-xs text-muted-foreground'>
							{competition.sport === "cricket"
								? "Picks close at the start, toss questions 35 minutes before. One notification for the lot."
								: "Picks close at kickoff. One notification for the lot."}
						</p>
						<Button
							variant='linear'
							size='lg'
							disabled={chosen.length === 0 || !seriesId || isAdding}
							onClick={submit}
						>
							{isAdding ? <Spinner /> : null}
							<m.span
								key={chosen.length}
								initial={{ scale: chosen.length > 0 ? 0.92 : 1 }}
								animate={{ scale: 1 }}
								transition={{ duration: 0.2, ease: EASE_OUT }}
							>
								{chosen.length === 0
									? "Add questions"
									: `Add ${chosen.length} ${chosen.length === 1 ? "question" : "questions"}`}
							</m.span>
						</Button>
					</div>
				</div>
			) : null}
		</>
	);
}

function MatchSelectAll({
	ids,
	selected,
	onToggle,
}: Readonly<{ ids: string[]; selected: ReadonlySet<string>; onToggle: (ids: string[], on: boolean) => void }>) {
	const all = ids.every((id) => selected.has(id));
	return (
		<button
			type='button'
			onClick={() => onToggle(ids, !all)}
			className='mt-2 h-7 rounded-md border px-2.5 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
		>
			{all ? "Clear" : `Select all ${ids.length}`}
		</button>
	);
}

function QuestionRow({
	question,
	roomCode,
	checked,
	onToggle,
}: Readonly<{ question: FixtureQuestion; roomCode: string; checked: boolean; onToggle: (on: boolean) => void }>) {
	const id = `fixture-question-${question.id}`;

	if (question.prediction_id) {
		return (
			<li>
				<Link
					to={`/rooms/${roomCode}/predictions/${question.prediction_id}`}
					className='-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
				>
					<CheckCircle2Icon className='mt-0.5 size-4 shrink-0 text-win' aria-hidden='true' />
					<span className='min-w-0 flex-1'>
						<span className='block text-sm text-muted-foreground'>{question.title}</span>
						<span className='block text-xs text-muted-foreground'>Added</span>
					</span>
				</Link>
			</li>
		);
	}

	return (
		<li className='-mx-2 flex items-start gap-3 rounded-lg px-2 py-2'>
			<m.span animate={{ scale: checked ? [0.85, 1] : 1 }} transition={{ duration: 0.2, ease: EASE_OUT }} className='mt-0.5 flex'>
				<Checkbox id={id} checked={checked} onCheckedChange={(value) => onToggle(value === true)} />
			</m.span>
			<label htmlFor={id} className='min-w-0 flex-1 cursor-pointer'>
				<span className='block text-sm font-medium'>{question.title}</span>
				<span className='block truncate text-xs text-muted-foreground'>{question.options.join(" / ")}</span>
				{question.closes_before ? (
					<span className='block text-xs text-muted-foreground'>
						Closes {question.closes_before} minutes before the start
					</span>
				) : null}
			</label>
		</li>
	);
}
