import { ChevronLeftIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExtraQuestionDialog } from "@/features/admin/components/ExtraQuestionDialog";
import { FixtureQuestionRow } from "@/features/admin/components/FixtureQuestionRow";
import { useAdminCompetitions, useAdminFixtures } from "@/features/admin/hooks";
import {
	chipClass,
	DayHeader,
	daysOf,
	matchDetail,
	MatchAccordion,
	RoundFilters,
	roundsOf,
	useStickyOffset,
	type MatchState,
} from "@/features/fixtures";
import type { AdminUpcomingFixture } from "@/shared/lib/api";
import { Button, Skeleton } from "@/shared/ui";

type Only = "all" | "reworded" | "hidden";

// One competition's coming matches for admins, laid out like the hosts'
// page: show or hide each question, or reword it for one match.
export default function AdminCompetitionFixturesPage() {
	const { competitionId = "" } = useParams<{ competitionId: string }>();
	const { data, isPending, isError, refetch } = useAdminFixtures(competitionId);
	const { data: competitions } = useAdminCompetitions();
	const competition = competitions?.find((c) => c.id === competitionId);
	const [round, setRound] = useState<string | null>(null);
	const [only, setOnly] = useState<Only>("all");
	const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
	// The match an extra question is being written for.
	const [extraFor, setExtraFor] = useState<AdminUpcomingFixture | null>(null);
	const { header, total, ref: filtersRef } = useStickyOffset();

	const rounds = useMemo(() => roundsOf(data ?? []), [data]);
	const activeRound = rounds.find((r) => r.label === round) ?? rounds[0] ?? null;
	const visible = useMemo(
		() =>
			(activeRound?.fixtures ?? [])
				.map((fixture) => ({
					...fixture,
					questions: fixture.questions.filter(
						(q) => only === "all" || (only === "reworded" ? q.customized : q.hidden),
					),
				}))
				.filter((fixture) => fixture.questions.length > 0),
		[activeRound, only],
	);
	const days = useMemo(() => daysOf(visible), [visible]);

	// Open by default where rooms have added something: that's what to check.
	const isOpen = (fixture: AdminUpcomingFixture) =>
		openOverride[fixture.id] ?? fixture.questions.some((q) => q.rooms > 0);
	const allOpen = visible.length > 0 && visible.every(isOpen);
	const setOpen = (ids: string[], open: boolean) =>
		setOpenOverride((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, open])) }));

	const stateOf = (fixture: AdminUpcomingFixture): MatchState => {
		const rooms = Math.max(0, ...fixture.questions.map((q) => q.rooms));
		const hidden = fixture.questions.filter((q) => q.hidden).length;
		if (rooms > 0) return { tone: "some", label: `In ${rooms} ${rooms === 1 ? "room" : "rooms"}` };
		if (hidden === fixture.questions.length) return { tone: "none", label: "All hidden" };
		return { tone: "none", label: "Not added" };
	};

	const onlyChips: { value: Only; label: string }[] = [
		{ value: "reworded", label: "Reworded" },
		{ value: "hidden", label: "Hidden" },
	];

	return (
		<div className='-mx-4 -mt-4'>
			<header className='flex items-center gap-2 px-4 pt-4 pb-3'>
				<Link
					to='/admin/fixtures'
					aria-label='All competitions'
					className='-ml-2 rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
				>
					<ChevronLeftIcon className='size-5' />
				</Link>
				<div className='min-w-0'>
					<h2 className='truncate text-lg font-bold'>{competition?.name ?? "Fixtures"}</h2>
					<p className='text-xs text-muted-foreground'>The next six weeks</p>
				</div>
			</header>

			<RoundFilters
				ref={filtersRef}
				top={header}
				allOpen={allOpen}
				onToggleAll={() => setOpen(visible.map((f) => f.id), !allOpen)}
				toggles={onlyChips.map((chip) => (
					<button
						key={chip.value}
						type='button'
						aria-pressed={only === chip.value}
						onClick={() => setOnly((current) => (current === chip.value ? "all" : chip.value))}
						className={chipClass(only === chip.value, "soft")}
					>
						{chip.label}
					</button>
				))}
				rounds={rounds.map((r) => r.label)}
				round={activeRound?.label ?? null}
				onRoundChange={setRound}
			/>

			{isPending ? (
				<div className='p-4'>
					<Skeleton className='h-40 w-full rounded-2xl' />
				</div>
			) : isError ? (
				<p className='p-4 text-sm text-muted-foreground'>
					Couldn't load the fixtures.{" "}
					<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
						Try again
					</button>
				</p>
			) : days.length === 0 ? (
				<p className='m-4 rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
					{rounds.length === 0
						? "No matches in the next six weeks. Check the competition has synced."
						: only === "all"
							? "Nothing in this round."
							: `No ${only} questions in ${activeRound?.label}.`}
				</p>
			) : (
				<div className='pb-6 lg:space-y-3 lg:px-4 lg:pt-3'>
					{days.map((day) => (
						<section key={day.label} className='lg:overflow-clip lg:rounded-2xl lg:border'>
							<DayHeader label={day.label} top={total} />
							{day.fixtures.map((fixture) => (
								<MatchAccordion
									key={fixture.id}
									home={fixture.home}
									away={fixture.away}
									kickoffAt={fixture.kickoff_at}
									detail={matchDetail(fixture)}
									state={stateOf(fixture)}
									open={isOpen(fixture)}
									onOpenChange={(open) => setOpen([fixture.id], open)}
								>
									<ul className='divide-y'>
										{fixture.questions.map((question) => (
											<FixtureQuestionRow key={question.id} question={question} />
										))}
									</ul>
									<Button variant='outline' size='sm' className='mt-2' onClick={() => setExtraFor(fixture)}>
										<PlusIcon />
										Extra question
									</Button>
								</MatchAccordion>
							))}
						</section>
					))}
				</div>
			)}

			{extraFor ? (
				<ExtraQuestionDialog
					fixtureId={extraFor.id}
					match={`${extraFor.home} vs ${extraFor.away}`}
					open
					onOpenChange={(open) => {
						if (!open) setExtraFor(null);
					}}
				/>
			) : null}
		</div>
	);
}
