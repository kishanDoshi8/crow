import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CompetitionRow, FollowButton, kindLabel } from "@/features/fixtures/components/CompetitionRow";
import { ListSkeleton } from "@/features/fixtures/components/ListSkeleton";
import { chipClass } from "@/features/fixtures/components/RoundFilters";
import { useRoomCompetitions } from "@/features/fixtures/hooks";
import { categoryOf, sportLabel } from "@/features/fixtures/lib/grouping";
import { useStickyOffset } from "@/features/fixtures/lib/useStickyOffset";
import { useRoomRole } from "@/features/rooms";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Input } from "@/shared/ui";

type Filter = "all" | "following" | string;

// Every competition on offer, searchable, filtered by sport and grouped by
// sport and where it's played. Follow from the list, or open one.
export default function BrowseCompetitionsPage() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data, isPending, isError, refetch } = useRoomCompetitions(room.id, can.organize);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const { header } = useStickyOffset();

	const sports = useMemo(() => [...new Set((data ?? []).map((c) => c.sport))], [data]);
	const groups = useMemo(() => {
		const q = query.trim().toLowerCase();
		const shown = (data ?? []).filter(
			(c) =>
				(filter === "all" || (filter === "following" ? c.following : c.sport === filter)) &&
				(!q || `${c.name} ${categoryOf(c)} ${c.region ?? ""}`.toLowerCase().includes(q)),
		);
		const byCategory = new Map<string, typeof shown>();
		for (const competition of shown) {
			const key = categoryOf(competition);
			byCategory.set(key, [...(byCategory.get(key) ?? []), competition]);
		}
		return [...byCategory.entries()];
	}, [data, filter, query]);

	if (!can.organize) return <Navigate to={`/rooms/${room.code}`} replace />;

	const count = (f: Filter) =>
		(data ?? []).filter((c) => f === "all" || (f === "following" ? c.following : c.sport === f)).length;
	const filters: { value: Filter; label: string }[] = [
		{ value: "all", label: "All" },
		{ value: "following", label: "Following" },
		...sports.map((sport) => ({ value: sport, label: sportLabel(sport) })),
	];

	return (
		<div className='mx-auto w-full max-w-md lg:max-w-2xl lg:pt-2'>
			<div
				style={{ top: header }}
				className='sticky z-[6] space-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85'
			>
				<label className='relative block'>
					<span className='sr-only'>Search competitions</span>
					<SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
					<Input
						id='browse-search'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder='Search competitions or countries'
						className='pl-9'
					/>
				</label>
				<div className='flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
					{filters.map((f) => (
						<button
							key={f.value}
							type='button'
							aria-pressed={filter === f.value}
							onClick={() => setFilter(f.value)}
							className={chipClass(filter === f.value)}
						>
							{f.label}
							<span className='opacity-60 tabular-nums'>{count(f.value)}</span>
						</button>
					))}
				</div>
			</div>

			<div className='space-y-5 p-4'>
				{isPending ? (
					<div className='divide-y rounded-2xl border bg-card'>
						<ListSkeleton />
					</div>
				) : isError ? (
					<p className='text-sm text-muted-foreground'>
						Couldn't load the competitions.{" "}
						<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
							Try again
						</button>
					</p>
				) : groups.length === 0 ? (
					<p className='rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
						{query.trim() ? `No competitions match "${query.trim()}".` : "Nothing here yet."}
					</p>
				) : (
					groups.map(([category, competitions]) => (
						<section key={category} className='space-y-2'>
							<h2 className='px-1 text-sm font-semibold text-muted-foreground'>{category}</h2>
							<div className='divide-y rounded-2xl border bg-card'>
								{competitions.map((competition) => (
									<CompetitionRow
										key={competition.id}
										to={`/rooms/${room.code}/manage/fixtures/${competition.id}`}
										name={competition.name}
										lines={[
											[kindLabel(competition.kind), competition.season].filter(Boolean).join(", "),
										]}
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
						</section>
					))
				)}
			</div>
		</div>
	);
}
