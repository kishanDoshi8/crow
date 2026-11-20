import { CheckCircle2Icon, PlusIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
	useAddFixtureQuestions,
	useFollowCompetition,
	useRoomFixtures,
} from "@/features/fixtures/hooks";
import { useRoomRole } from "@/features/rooms";
import { SeriesSelector, useCurrentSeries } from "@/features/series";
import type { Fixture, FixtureCompetition, FixtureQuestion } from "@/shared/lib/api";
import { describeDeadline } from "@/shared/lib/deadline";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Alert, AlertDescription, Button, Checkbox, Skeleton, Spinner } from "@/shared/ui";
import { Switch } from "@/shared/ui/switch";

type Group = {
	key: string;
	competition: string;
	// "Matchweek 13", "Quarter-finals", or the day when the round has no name.
	title: string;
	fixtures: Fixture[];
};

// Fixtures arrive in kickoff order; each competition's round becomes one
// group, in the order its first match kicks off.
function groupFixtures(fixtures: Fixture[]) {
	const groups: Group[] = [];
	for (const fixture of fixtures) {
		const title =
			fixture.round_label ??
			new Intl.DateTimeFormat("en-US", {
				weekday: "long",
				month: "short",
				day: "numeric",
			}).format(new Date(fixture.kickoff_at));
		const key = `${fixture.competition_id}:${title}`;
		const group = groups.find((g) => g.key === key);
		if (group) group.fixtures.push(fixture);
		else
			groups.push({
				key,
				competition: fixture.competition_name,
				title,
				fixtures: [fixture],
			});
	}
	return groups;
}

// Questions in a set of fixtures the room doesn't have yet.
const addable = (fixtures: Fixture[]) =>
	fixtures.flatMap((fixture) =>
		fixture.questions.filter((question) => !question.prediction_id).map((question) => question.id),
	);

// Organizers follow real competitions and pick ready-made questions from
// their upcoming matches. Picks close at kickoff; players get one
// notification for everything added together.
export default function FixturesPage() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data, isPending, isError, refetch } = useRoomFixtures(room.id, can.organize);
	const { mutate: follow } = useFollowCompetition(room.id);
	const { mutate: addQuestions, isPending: isAdding } = useAddFixtureQuestions(room.id);
	const { currentSeries, hasActiveSeries, isPending: isSeriesPending } = useCurrentSeries(room.id);
	const [seriesId, setSeriesId] = useState<string | null>(
		currentSeries?.status === "active" ? currentSeries.id : null,
	);
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

	const fixtures = useMemo(() => data?.fixtures ?? [], [data?.fixtures]);
	const groups = useMemo(() => groupFixtures(fixtures), [fixtures]);
	// A match that kicked off, or a question added meanwhile, drops out.
	const chosen = useMemo(() => {
		const available = new Set(addable(fixtures));
		return [...selected].filter((id) => available.has(id));
	}, [fixtures, selected]);

	if (!can.organize) {
		return <Navigate to={`/rooms/${room.code}`} replace />;
	}

	const competitions = data?.competitions ?? [];
	const following = competitions.filter((competition) => competition.following);

	const toggle = (ids: string[], on: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			for (const id of ids) {
				if (on) next.add(id);
				else next.delete(id);
			}
			return next;
		});

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

	return (
		<>
			<div className='mx-auto w-full max-w-md space-y-6 p-4 lg:max-w-2xl lg:pt-6'>
				<section className='space-y-2'>
					<SectionHeading>Competitions</SectionHeading>
					<div className='divide-y rounded-2xl border bg-card'>
						{isPending ? (
							<RowSkeleton />
						) : isError ? (
							<p className='px-3 py-4 text-sm text-muted-foreground'>
								Couldn't load the competitions.{" "}
								<button
									type='button'
									className='font-medium text-foreground underline underline-offset-2'
									onClick={() => void refetch()}
								>
									Try again
								</button>
							</p>
						) : (
							competitions.map((competition) => (
								<CompetitionRow
									key={competition.id}
									competition={competition}
									onFollow={(on) =>
										follow(
											{ competitionId: competition.id, follow: on },
											{
												onError: () =>
													toast.error(
														on
															? "Couldn't follow that competition. Try again."
															: "Couldn't unfollow that competition. Try again.",
														{ position: "top-center" },
													),
											},
										)
									}
								/>
							))
						)}
					</div>
				</section>

				{!isSeriesPending && !hasActiveSeries ? (
					<Alert>
						<AlertDescription className='space-y-3'>
							<p>
								Start a series first. Questions from the fixtures go into the
								active series.
							</p>
							<Button asChild size='sm' variant='outline'>
								<Link to={`/rooms/${room.code}/series/new`}>
									<PlusIcon />
									New series
								</Link>
							</Button>
						</AlertDescription>
					</Alert>
				) : following.length > 0 ? (
					<div className='space-y-1.5'>
						<label htmlFor='fixtures-series' className='px-1 text-xs font-medium text-muted-foreground'>
							Add to series
						</label>
						<SeriesSelector
							roomId={room.id}
							mode='active'
							value={seriesId}
							onValueChange={setSeriesId}
							placeholder='Select a series'
							autoSelect
						/>
					</div>
				) : null}

				{isPending || isError ? null : following.length === 0 ? (
					<EmptyCard>
						Follow a competition to see its matches here and add questions
						for them in a tap.
					</EmptyCard>
				) : groups.length === 0 ? (
					<EmptyCard>No matches in the next two weeks.</EmptyCard>
				) : (
					groups.map((group) => {
						const ids = addable(group.fixtures);
						const allChosen = ids.length > 0 && ids.every((id) => selected.has(id));
						return (
							<section key={group.key} className='space-y-2'>
								<div className='flex items-end justify-between gap-3 px-1'>
									<div className='min-w-0'>
										<p className='truncate text-xs text-muted-foreground'>{group.competition}</p>
										<h2 className='truncate text-sm font-semibold'>{group.title}</h2>
									</div>
									{ids.length > 0 ? (
										<Button
											variant='ghost'
											size='sm'
											className='shrink-0'
											onClick={() => toggle(ids, !allChosen)}
										>
											{allChosen ? "Clear" : "Select all"}
										</Button>
									) : null}
								</div>
								{group.fixtures.map((fixture) => (
									<FixtureCard
										key={fixture.id}
										fixture={fixture}
										roomCode={room.code}
										selected={selected}
										onToggle={(id, on) => toggle([id], on)}
									/>
								))}
							</section>
						);
					})
				)}
			</div>

			{following.length > 0 && hasActiveSeries ? (
				<div className='sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
					<div className='mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:max-w-2xl'>
						<p className='min-w-0 flex-1 text-xs text-muted-foreground'>
							Picks close at kickoff.
						</p>
						<Button
							variant='linear'
							size='lg'
							disabled={chosen.length === 0 || !seriesId || isAdding}
							onClick={submit}
						>
							{isAdding ? <Spinner /> : null}
							{chosen.length === 0
								? "Add questions"
								: `Add ${chosen.length} ${chosen.length === 1 ? "question" : "questions"}`}
						</Button>
					</div>
				</div>
			) : null}
		</>
	);
}

function SectionHeading({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<h2 className='px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
			{children}
		</h2>
	);
}

function CompetitionRow({
	competition,
	onFollow,
}: Readonly<{ competition: FixtureCompetition; onFollow: (on: boolean) => void }>) {
	const id = `follow-${competition.id}`;
	return (
		<div className='flex items-center gap-3 px-3 py-2.5'>
			<label htmlFor={id} className='min-w-0 flex-1 cursor-pointer'>
				<span className='block truncate text-sm font-medium'>{competition.name}</span>
				{competition.season ? (
					<span className='block text-xs text-muted-foreground'>{competition.season}</span>
				) : null}
			</label>
			<Switch id={id} checked={competition.following} onCheckedChange={onFollow} />
		</div>
	);
}

function FixtureCard({
	fixture,
	roomCode,
	selected,
	onToggle,
}: Readonly<{
	fixture: Fixture;
	roomCode: string;
	selected: ReadonlySet<string>;
	onToggle: (id: string, on: boolean) => void;
}>) {
	return (
		<article className='rounded-2xl border bg-card'>
			<header className='flex items-baseline justify-between gap-3 px-3 pt-3 pb-1'>
				<h3 className='min-w-0 text-sm font-semibold'>
					{fixture.home} vs {fixture.away}
				</h3>
				<time dateTime={fixture.kickoff_at} className='shrink-0 text-xs text-muted-foreground'>
					{describeDeadline(new Date(fixture.kickoff_at)).when}
				</time>
			</header>
			<ul className='divide-y'>
				{fixture.questions.map((question) => (
					<QuestionRow
						key={question.id}
						question={question}
						roomCode={roomCode}
						checked={selected.has(question.id)}
						onToggle={(on) => onToggle(question.id, on)}
					/>
				))}
			</ul>
		</article>
	);
}

function QuestionRow({
	question,
	roomCode,
	checked,
	onToggle,
}: Readonly<{
	question: FixtureQuestion;
	roomCode: string;
	checked: boolean;
	onToggle: (on: boolean) => void;
}>) {
	const id = `fixture-question-${question.id}`;
	const options = question.options.join(" / ");

	if (question.prediction_id) {
		return (
			<li>
				<Link
					to={`/rooms/${roomCode}/predictions/${question.prediction_id}`}
					className='flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 last:rounded-b-2xl'
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
		<li className='flex items-start gap-3 px-3 py-2.5'>
			<Checkbox
				id={id}
				className='mt-0.5'
				checked={checked}
				onCheckedChange={(value) => onToggle(value === true)}
			/>
			<label htmlFor={id} className='min-w-0 flex-1 cursor-pointer'>
				<span className='block text-sm font-medium'>{question.title}</span>
				<span className='block truncate text-xs text-muted-foreground'>{options}</span>
			</label>
		</li>
	);
}

function EmptyCard({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<p className='rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
			{children}
		</p>
	);
}

function RowSkeleton() {
	return [0, 1].map((row) => (
		<div key={row} aria-hidden='true' className='flex items-center gap-3 px-3 py-2.5'>
			<div className='flex min-w-0 flex-1 flex-col gap-2 py-1'>
				<Skeleton className='h-3.5 w-1/2' />
				<Skeleton className='h-3 w-1/4' />
			</div>
			<Skeleton className='h-6 w-11 rounded-full' />
		</div>
	));
}
