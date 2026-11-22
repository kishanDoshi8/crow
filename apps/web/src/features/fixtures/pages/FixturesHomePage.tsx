import { SearchIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { CompetitionRow, FollowButton } from "@/features/fixtures/components/CompetitionRow";
import { useRoomCompetitions } from "@/features/fixtures/hooks";
import { categoryOf } from "@/features/fixtures/lib/grouping";
import { nextLine, weekLine } from "@/features/fixtures/lib/lines";
import { ListSkeleton } from "@/features/fixtures/components/ListSkeleton";
import { useRoomRole } from "@/features/rooms";
import { NoActiveSeries } from "@/features/fixtures/components/NoActiveSeries";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Input } from "@/shared/ui";

// Manage → Fixtures: the competitions the room follows, and a way to find
// more. Each opens its own page of matches.
export default function FixturesHomePage() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data, isPending, isError, refetch } = useRoomCompetitions(room.id, can.organize);
	const [query, setQuery] = useState("");

	const following = useMemo(() => (data ?? []).filter((c) => c.following), [data]);
	const others = useMemo(() => {
		const all = (data ?? []).filter((c) => !c.following);
		const q = query.trim().toLowerCase();
		if (!q) return all.slice(0, 3);
		return all.filter((c) => `${c.name} ${categoryOf(c)}`.toLowerCase().includes(q));
	}, [data, query]);

	if (!can.organize) return <Navigate to={`/rooms/${room.code}`} replace />;

	const base = `/rooms/${room.code}/manage/fixtures`;

	return (
		<div className='mx-auto w-full max-w-md space-y-6 p-4 lg:max-w-2xl lg:pt-6'>
			<NoActiveSeries roomId={room.id} roomCode={room.code} />

			<Section title='You follow'>
				{isPending ? (
					<ListSkeleton />
				) : isError ? (
					<p className='px-3 py-4 text-sm text-muted-foreground'>
						Couldn't load your competitions.{" "}
						<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
							Try again
						</button>
					</p>
				) : following.length === 0 ? (
					<p className='px-3 py-4 text-sm text-muted-foreground'>
						Follow a competition below to add questions for its matches in a tap.
					</p>
				) : (
					following.map((competition) => (
						<CompetitionRow
							key={competition.id}
							to={`${base}/${competition.id}`}
							name={competition.name}
							lines={[nextLine(competition), weekLine(competition)]}
						/>
					))
				)}
			</Section>

			<section className='space-y-2'>
				<h2 className='px-1 text-sm font-semibold text-muted-foreground'>Find more</h2>
				<label className='relative block'>
					<span className='sr-only'>Search competitions</span>
					<SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
					<Input
						id='fixtures-search'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder='Search competitions'
						className='pl-9'
					/>
				</label>
				{data && others.length > 0 ? (
					<div className='divide-y rounded-2xl border bg-card'>
						{others.map((competition) => (
							<CompetitionRow
								key={competition.id}
								to={`${base}/${competition.id}`}
								name={competition.name}
								lines={[categoryOf(competition)]}
								trailing={
									<FollowButton
										roomId={room.id}
										competitionId={competition.id}
										name={competition.name}
										following={competition.following}
									/>
								}
							/>
						))}
					</div>
				) : data && query.trim() ? (
					<p className='px-1 text-sm text-muted-foreground'>No competitions match "{query.trim()}".</p>
				) : null}
				{data ? (
					<Link
						to={`${base}/browse`}
						className='inline-block px-1 pt-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
					>
						Browse all {data.length} {data.length === 1 ? "competition" : "competitions"}
					</Link>
				) : null}
			</section>
		</div>
	);
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
	return (
		<section className='space-y-2'>
			<h2 className='px-1 text-sm font-semibold text-muted-foreground'>{title}</h2>
			<div className='divide-y rounded-2xl border bg-card'>{children}</div>
		</section>
	);
}
